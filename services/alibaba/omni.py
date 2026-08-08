"""Qwen 3.5 Omni speech and voice enrollment.

This is intentionally separate from Qwen-Audio-TTS.  Their enrollment models,
voice IDs, language coverage, billing and synthesis protocols are different.
"""

import base64
import io
import json
import os
import subprocess
import urllib.error
import urllib.request
import wave
from typing import NamedTuple

from openai import APIStatusError, OpenAI

from . import config


class ChunkFailure(NamedTuple):
    index: int
    text: str
    error: str


def _request(payload: dict) -> dict:
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    request = urllib.request.Request(
        config.enrollment_url(),
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:1000]
        raise RuntimeError(f"Alibaba Omni enrollment failed ({exc.code}): {detail}") from exc
    if result.get("code") or result.get("message") and not result.get("output"):
        raise RuntimeError(result.get("message") or result.get("code"))
    return result


def create_voice(target_model: str, preferred_name: str, audio_url: str,
                 language: str | None = None, transcript: str | None = None) -> str:
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
    result = _request(body)
    try:
        return result["output"]["voice"]
    except (KeyError, TypeError) as exc:
        raise RuntimeError("Alibaba returned no Omni voice ID") from exc


def list_voices() -> list[dict]:
    result = _request({
        "model": "qwen-voice-enrollment",
        "input": {"action": "list", "page_size": 100, "page_index": 0},
    })
    voices = result.get("output", {}).get("voice_list", []) or []
    return [{**voice, "voice_id": voice.get("voice"), "engine": "omni"}
            for voice in voices if voice.get("voice")]


def delete_voice(voice: str) -> None:
    _request({
        "model": "qwen-voice-enrollment",
        "input": {"action": "delete", "voice": voice},
    })


def is_voice(voice: str) -> bool:
    return str(voice).startswith("qwen-omni-vc-")


def _pcm_to_wav(pcm: bytes) -> bytes:
    target = io.BytesIO()
    with wave.open(target, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(pcm)
    return target.getvalue()


def _encode(pcm: bytes, output_format: str) -> bytes:
    wav = _pcm_to_wav(pcm)
    if output_format == "wav":
        return wav
    codec = (["-f", "ogg", "-c:a", "libopus", "-b:a", "64k"]
             if output_format == "opus" else
             ["-f", "mp3", "-b:a", "256k"])
    done = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", *codec, "pipe:1"],
        input=wav, capture_output=True,
    )
    if done.returncode != 0 or not done.stdout:
        raise RuntimeError(done.stderr.decode(errors="replace") or "ffmpeg could not encode Omni audio")
    return done.stdout


def _event_parts(event: dict) -> tuple[list[str], list[str], list[str]]:
    """Extract audio/text from documented OpenAI and DashScope envelopes."""
    audio, text, shapes = [], [], []

    def collect_audio(value):
        """Collect Base64 through object, direct-string and list gateways."""
        if isinstance(value, str):
            if value:
                audio.append(value)
            return
        if isinstance(value, list):
            for item in value:
                collect_audio(item)
            return
        if not isinstance(value, dict):
            return
        if value.get("data") is not None:
            collect_audio(value["data"])
            return
        # Some compatible gateways wrap the documented object one level deeper.
        for key in ("audio", "output_audio", "content", "chunk"):
            if key in value:
                collect_audio(value[key])

    def consume(part):
        if not isinstance(part, dict):
            return
        value = part.get("audio")
        collect_audio(value)
        if part.get("data") and part.get("type") in ("audio", "output_audio"):
            collect_audio(part["data"])
        value = part.get("text")
        if isinstance(value, str):
            text.append(value)

    choices = event.get("choices") or []
    if choices:
        choice = choices[0] or {}
        delta = choice.get("delta") or choice.get("message") or {}
        envelope = "delta" if choice.get("delta") is not None else "message"
        shapes.append(f"choices.{envelope}:" + ",".join(sorted(delta.keys())))
        value = delta.get("audio")
        if "audio" in delta:
            if value is None:
                shapes.append("choices.audio:null")
            elif isinstance(value, dict):
                shapes.append("choices.audio:object[" + ",".join(sorted(value.keys())) + "]")
            elif isinstance(value, list):
                shapes.append(f"choices.audio:list[{len(value)}]")
            elif isinstance(value, str):
                shapes.append(f"choices.audio:string[{len(value)}]")
            else:
                shapes.append(f"choices.audio:{type(value).__name__}")
        collect_audio(value)
        content = delta.get("content")
        if isinstance(content, str):
            text.append(content)
        elif isinstance(content, list):
            for part in content:
                consume(part)

    output = event.get("output") or {}
    native_choices = output.get("choices") or []
    if native_choices:
        message = native_choices[0].get("message") or {}
        shapes.append("output.choices.message:" + ",".join(sorted(message.keys())))
        content = message.get("content")
        if isinstance(content, str):
            text.append(content)
        elif isinstance(content, list):
            for part in content:
                consume(part)
    direct_audio = output.get("audio")
    before = len(audio)
    collect_audio(direct_audio)
    if len(audio) > before:
        shapes.append("output.audio")
    return audio, text, shapes


def _stream_events(payload: dict, key: str):
    """Yield plain dictionaries from Alibaba through the documented SDK.

    The OpenAI client owns SSE framing and schema evolution.  Keeping that
    responsibility out of this adapter prevents a large audio event from being
    silently discarded while hand-parsing response lines.
    """
    client = OpenAI(api_key=key, base_url=config.compatible_base_url())
    try:
        stream = client.chat.completions.create(**payload)
        for chunk in stream:
            yield chunk.model_dump(mode="json", exclude_none=False)
    except APIStatusError as exc:
        detail = str(exc)
        if getattr(exc, "response", None) is not None:
            detail = exc.response.text[:1000]
        raise RuntimeError(
            f"Alibaba Qwen 3.5 Omni failed ({exc.status_code}): {detail}") from exc


def _speak_chunk(text: str, model: str, voice: str,
                 instruction: str | None = None,
                 speech_mode: str = "exact") -> tuple[bytes, str, dict]:
    # Omni is a conversational Thinker/Talker, not a literal TTS endpoint.  A
    # bare fragment is answered instead of read.  Keep the steering minimal and
    # entirely inside the single documented user message: no system role, XML
    # wrapper, Composer metadata or model-specific hidden flags.
    prompt = ((
        "Speak the following text exactly as written while following this "
        f"performance direction: {instruction}\n"
        "Do not add, remove, translate, answer, explain, or introduce any words.\n\n"
        + text
    ) if speech_mode == "directed" and instruction else (
        "Repeat the following text verbatim. Output only that text, with no "
        "introduction, answer, explanation, formatting, or added words:\n\n"
        + text
    ))
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["text", "audio"],
        "audio": {"voice": voice, "format": "wav"},
        # Qwen Omni audio output is streaming-only.  The compatible endpoint is
        # also the path Alibaba currently documents for workspace-bound cloned
        # voices; the older native SDK path can reject a valid qwen-omni-vc ID.
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    audio_base64 = []
    returned_text = []
    response_shapes = set()
    event_count = 0
    usage = {}
    for event in _stream_events(payload, key):
        event_count += 1
        if isinstance(event.get("usage"), dict):
            usage = event["usage"]
        audio, text, shapes = _event_parts(event)
        audio_base64.extend(audio)
        returned_text.extend(text)
        response_shapes.update(shapes)
    if not audio_base64:
        detail = "; ".join(sorted(response_shapes)) or "no choice payloads"
        returned = "".join(returned_text).strip()
        suffix = f" Text returned: {returned[:160]}" if returned else ""
        completion = usage.get("completion_tokens_details") or {}
        audio_tokens = completion.get("audio_tokens")
        billed = f" Alibaba reported {audio_tokens} output audio tokens." if audio_tokens is not None else ""
        raise RuntimeError(
            f"Qwen 3.5 Omni returned no audio across {event_count} SSE events "
            f"({detail}).{billed}{suffix}")
    # Alibaba streams pieces of one Base64 string. Decode only after joining;
    # decoding each piece independently can silently drop bytes at boundaries.
    prompt_details = usage.get("prompt_tokens_details") or {}
    completion_details = usage.get("completion_tokens_details") or {}
    prompt_total = int(usage.get("prompt_tokens") or 0)
    completion_total = int(usage.get("completion_tokens") or 0)
    input_audio = int(prompt_details.get("audio_tokens") or 0)
    output_audio = int(completion_details.get("audio_tokens") or 0)
    measured = {
        "input_text": int(prompt_details.get("text_tokens") or
                          max(0, prompt_total - input_audio)),
        "input_audio": input_audio,
        "output_text": int(completion_details.get("text_tokens") or
                           max(0, completion_total - output_audio)),
        "output_audio": output_audio,
        "total": int(usage.get("total_tokens") or prompt_total + completion_total),
    }
    return (base64.b64decode("".join(audio_base64)),
            "".join(returned_text), measured)


def synthesize(chunks, options, on_progress=None):
    pcm = bytearray()
    failures = []
    transcripts = []
    usage = {kind: 0 for kind in
             ("input_text", "input_audio", "output_text", "output_audio", "total")}
    for index, chunk in enumerate(chunks, 1):
        if on_progress:
            on_progress(index, len(chunks), chunk)
        try:
            audio, returned, measured = _speak_chunk(
                chunk, options.model_id, options.voice, options.instruction,
                getattr(options, "speech_mode", "exact"))
            pcm.extend(audio)
            transcripts.append(returned)
            for kind in usage:
                usage[kind] += int(measured.get(kind) or 0)
        except Exception as exc:
            failures.append(ChunkFailure(index, chunk, f"{type(exc).__name__}: {exc}"))
            if not pcm:
                raise
    return _encode(bytes(pcm), options.format), failures, transcripts, usage
