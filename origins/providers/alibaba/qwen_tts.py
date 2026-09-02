"""Alibaba Qwen3-TTS cloned-voice HTTP synthesis.

The public application accepts long scripts. This adapter owns the provider's
512-token request boundary, downloads each completed WAV result, and produces
one valid output file. Callers never need to shorten their content manually.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import NamedTuple

from origins.domain import provider_catalog, speech_segments, token_budget
from origins.providers.alibaba import config
from origins.infrastructure import audio_codec


# Provider synthesis calls have no billing-safe idempotency guarantee.
# Ambiguous failures are persisted and retried only by an operator.
RETRIES = 1
BACKOFF = 1.5
PROVIDER_TOKEN_LIMIT = int(provider_catalog.SEGMENTATION["qwen_tts"]
                           ["provider_token_limit"])
TOKEN_BUDGET = int(provider_catalog.SEGMENTATION["qwen_tts"]
                   ["planned_token_budget"])
MAX_LIMIT_RECOVERY_DEPTH = 3
FATAL_SIGNS = (
    "api key", "apikey", "unauthorized", "forbidden", "arrearage",
    "invalid parameter", "invalid_parameter", "unsupported language",
    "language_type", "model not exist", "voice not exist",
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


@dataclass(frozen=True, slots=True)
class QwenTtsPlan:
    segments: tuple[str, ...]

    @property
    def request_count(self) -> int:
        return len(self.segments)


def plan(text: str) -> QwenTtsPlan:
    return QwenTtsPlan(tuple(token_budget.split_to_budget(
        text, budget=TOKEN_BUDGET)))


def _enrollment_request(payload: dict) -> dict:
    key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    request = urllib.request.Request(
        config.enrollment_url(),
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:1000]
        raise RuntimeError(
            f"Alibaba Qwen3 TTS voice enrollment failed "
            f"({exc.code}): {detail}") from exc
    if result.get("code") or (
            result.get("message") and not result.get("output")):
        raise RuntimeError(str(result.get("message") or result.get("code")))
    return result


def create_voice(target_model: str, preferred_name: str, audio_url: str,
                 language: str | None = None,
                 transcript: str | None = None) -> str:
    """Create one Qwen3 TTS cloned voice from the preserved source."""
    body = {
        "model": "qwen-voice-enrollment",
        "input": {
            "action": "create",
            "target_model": target_model,
            "preferred_name": preferred_name,
            "audio": {"data": audio_url},
        },
    }
    if language:
        body["input"]["language"] = language
    if transcript:
        body["input"]["text"] = transcript
    result = _enrollment_request(body)
    try:
        return str(result["output"]["voice"])
    except (KeyError, TypeError) as exc:
        raise RuntimeError(
            "Alibaba returned no Qwen3 TTS cloned voice ID") from exc


def _language_type(language: str | None) -> str:
    """Use an explicit label only when Qwen-TTS documents that language."""
    requested = str(language or "").casefold()
    for label in provider_catalog.CAPABILITIES["qwen_tts"]["output_languages"]:
        if requested == label.casefold():
            return label
    return "Auto"


def _post(text: str, options) -> dict:
    key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    body = {
        "model": options.model_id,
        "input": {
            "text": text,
            "voice": options.voice,
            "language_type": _language_type(options.language),
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
    return audio_codec.decode_pcm(audio, sample_rate=24_000)


def _encode(pcm: bytes, output_format: str) -> bytes:
    return audio_codec.encode_pcm(
        pcm, sample_rate=24_000, output_format=output_format)


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


def _length_error(message: str) -> bool:
    lowered = message.casefold()
    return any(sign in lowered for sign in (
        "maximum input length", "input length", "too long",
        "token limit", "tokens limit", "exceeds the limit",
    ))


def synthesize(plan: QwenTtsPlan, options, on_progress=None,
               retries: int = RETRIES):
    pcm = bytearray()
    failures: list[ChunkFailure] = []
    usage: dict[str, int] = {}
    request_ids: list[str] = []
    diagnostics: list[dict] = []

    def render_segment(text: str, index: int, path: str,
                       depth: int = 0) -> tuple[bytes, bool]:
        last_error = ""
        for attempt in range(1, retries + 1):
            try:
                rendered = _render(text, options)
                decoded = _pcm(rendered.audio)
                for key, value in rendered.usage.items():
                    if isinstance(value, (int, float)):
                        usage[key] = int(usage.get(key, 0) + value)
                if rendered.request_id:
                    request_ids.append(rendered.request_id)
                diagnostics.append({
                    "segment": index, "path": path,
                    "request_id": rendered.request_id,
                    "finish_reason": rendered.finish_reason,
                    "characters": len(text),
                    "estimated_tokens": (
                        token_budget.conservative_qwen_tokens(text)),
                    "attempts": attempt, "status": "accepted",
                })
                return decoded, True
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                if _length_error(last_error) and depth < MAX_LIMIT_RECOVERY_DEPTH:
                    children = speech_segments.split_text(
                        text, limit=max(1, len(text) // 2))
                    if len(children) > 1:
                        diagnostics.append({
                            "segment": index, "path": path,
                            "characters": len(text), "attempts": attempt,
                            "status": "provider_limit_replanned",
                            "error": last_error,
                            "recovery_segments": len(children),
                        })
                        recovered = bytearray()
                        for child_index, child in enumerate(children, 1):
                            child_pcm, complete = render_segment(
                                child, index, f"{path}.{child_index}", depth + 1)
                            if not complete:
                                return b"", False
                            recovered.extend(child_pcm)
                        return bytes(recovered), True
                if _fatal(last_error) or attempt == retries:
                    break
                time.sleep(BACKOFF * 2 ** (attempt - 1))
        failures.append(ChunkFailure(index, text, last_error))
        diagnostics.append({
            "segment": index, "path": path, "characters": len(text),
            "estimated_tokens": token_budget.conservative_qwen_tokens(text),
            "attempts": attempt, "status": "failed", "error": last_error,
        })
        return b"", False

    for index, segment in enumerate(plan.segments, 1):
        if on_progress:
            on_progress(index, len(plan.segments), segment)
        rendered_pcm, complete = render_segment(segment, index, str(index))
        if not complete:
            return b"", failures, [], usage, request_ids, diagnostics
        pcm.extend(rendered_pcm)
    return (
        _encode(bytes(pcm), options.format) if pcm else b"",
        failures, [], usage, request_ids, diagnostics,
    )
