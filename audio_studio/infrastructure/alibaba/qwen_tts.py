"""Alibaba Qwen3-TTS cloned-voice HTTP synthesis.

The public application accepts long scripts. This adapter owns the provider's
512-token request boundary, downloads each completed WAV result, and produces
one valid output file. Callers never need to shorten their content manually.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import wave
from typing import NamedTuple

from audio_studio.infrastructure.alibaba import config


RETRIES = 3
BACKOFF = 1.5
FATAL_SIGNS = (
    "api key", "apikey", "unauthorized", "forbidden", "arrearage",
    "invalid parameter", "model not exist", "voice not exist",
)


class ChunkFailure(NamedTuple):
    index: int
    text: str
    error: str


class ChunkResult(NamedTuple):
    audio: bytes
    usage: dict
    request_id: str | None
    finish_reason: str | None


def _post(text: str, options) -> dict:
    key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    body = {
        "model": options.model_id,
        "input": {
            "text": text,
            "voice": options.voice,
            "language_type": options.language or "Auto",
        },
    }
    request = urllib.request.Request(
        config.regional_http_base()
        + "/services/aigc/multimodal-generation/generation",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:1000]
        raise RuntimeError(
            f"Alibaba Qwen3 TTS failed ({exc.code}): {detail}") from exc
    if result.get("code") or int(result.get("status_code") or 200) >= 400:
        raise RuntimeError(
            str(result.get("message") or result.get("code")
                or "Alibaba Qwen3 TTS request failed"))
    return result


def _download(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=180) as response:
            audio = response.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"Alibaba Qwen3 TTS audio download failed ({exc.code})") from exc
    if not audio:
        raise RuntimeError("Alibaba Qwen3 TTS returned an empty audio file")
    return audio


def _pcm(audio: bytes) -> bytes:
    done = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", "pipe:0",
         "-f", "s16le", "-ar", "24000", "-ac", "1", "pipe:1"],
        input=audio, capture_output=True,
    )
    if done.returncode or not done.stdout:
        raise RuntimeError(
            done.stderr.decode(errors="replace")
            or "ffmpeg could not decode Qwen3 TTS audio")
    return done.stdout


def _wav(pcm: bytes) -> bytes:
    target = io.BytesIO()
    with wave.open(target, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(24000)
        output.writeframes(pcm)
    return target.getvalue()


def _encode(pcm: bytes, output_format: str) -> bytes:
    wav = _wav(pcm)
    if output_format == "wav":
        return wav
    codec = (["-f", "ogg", "-c:a", "libopus", "-b:a", "64k"]
             if output_format == "opus" else
             ["-f", "mp3", "-b:a", "256k"])
    done = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "wav",
         "-i", "pipe:0", *codec, "pipe:1"],
        input=wav, capture_output=True,
    )
    if done.returncode or not done.stdout:
        raise RuntimeError(
            done.stderr.decode(errors="replace")
            or "ffmpeg could not encode Qwen3 TTS audio")
    return done.stdout


def _render(text: str, options) -> ChunkResult:
    result = _post(text, options)
    output = result.get("output") or {}
    audio = output.get("audio") or {}
    url = str(audio.get("url") or "").strip()
    if not url:
        raise RuntimeError("Alibaba Qwen3 TTS returned no audio URL")
    return ChunkResult(
        _download(url), result.get("usage") or {},
        result.get("request_id"), output.get("finish_reason"),
    )


def _fatal(message: str) -> bool:
    lowered = message.casefold()
    return any(sign in lowered for sign in FATAL_SIGNS)


def synthesize(chunks, options, on_progress=None, retries: int = RETRIES):
    pcm = bytearray()
    failures: list[ChunkFailure] = []
    usage: dict[str, int] = {}
    request_ids: list[str] = []
    diagnostics: list[dict] = []
    for index, chunk in enumerate(chunks, 1):
        if on_progress:
            on_progress(index, len(chunks), chunk)
        last_error = ""
        for attempt in range(1, retries + 1):
            try:
                rendered = _render(chunk, options)
                pcm.extend(_pcm(rendered.audio))
                for key, value in rendered.usage.items():
                    if isinstance(value, (int, float)):
                        usage[key] = int(usage.get(key, 0) + value)
                if rendered.request_id:
                    request_ids.append(rendered.request_id)
                diagnostics.append({
                    "chunk": index, "request_id": rendered.request_id,
                    "finish_reason": rendered.finish_reason,
                    "characters": len(chunk), "attempts": attempt,
                })
                break
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                if _fatal(last_error) or attempt == retries:
                    failures.append(ChunkFailure(index, chunk, last_error))
                    break
                time.sleep(BACKOFF * 2 ** (attempt - 1))
    return (
        _encode(bytes(pcm), options.format) if pcm else b"",
        failures, [], usage, request_ids, diagnostics,
    )
