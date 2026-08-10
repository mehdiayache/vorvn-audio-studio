"""Alibaba Qwen 3.5 Omni speech streaming and voice enrollment.

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

from audio_studio.domain import speech_fidelity, speech_text
from audio_studio.infrastructure.alibaba import config


class ChunkFailure(NamedTuple):
    index: int
    text: str
    error: str


class ChunkResponse(NamedTuple):
    audio: bytes
    text: str
    usage: dict
    request_id: str | None
    finish_reason: str | None
    event_count: int


PASSAGE_TARGET_CHARS = 240
RECOVERY_TARGET_CHARS = 120
MAX_ATTEMPTS_PER_PASSAGE = 2
PCM_SAMPLE_RATE = 24_000
PCM_SAMPLE_WIDTH = 2
SILENCE_AMPLITUDE = 128
MAX_TRAILING_SILENCE_SECONDS = 3.0
KEPT_TRAILING_SILENCE_SECONDS = 0.35


class OmniSynthesisError(RuntimeError):
    """Incomplete Omni render with evidence from every billed request."""

    def __init__(self, message: str, *, failures: list, usage: dict,
                 request_ids: list[str], diagnostics: list[dict]):
        super().__init__(message)
        self.failures = failures
        self.usage = usage
        self.request_ids = request_ids
        self.diagnostics = diagnostics


def _trim_pathological_trailing_silence(audio: bytes) -> tuple[bytes, int]:
    """Remove only provider padding that is far beyond a natural pause.

    Omni streams 24 kHz, mono, signed 16-bit PCM. A documented provider edge
    case can fill the remaining audio-token budget with silence after the
    spoken words. Inspect each provider passage before concatenation so this
    padding cannot become minutes of silence between otherwise valid sections.
    """
    frame_count = len(audio) // PCM_SAMPLE_WIDTH
    if frame_count <= int(MAX_TRAILING_SILENCE_SECONDS * PCM_SAMPLE_RATE):
        return audio, 0

    last_active = -1
    for index in range(frame_count - 1, -1, -1):
        start = index * PCM_SAMPLE_WIDTH
        sample = int.from_bytes(
            audio[start:start + PCM_SAMPLE_WIDTH], "little", signed=True)
        if abs(sample) > SILENCE_AMPLITUDE:
            last_active = index
            break
    if last_active < 0:
        return audio, 0

    trailing_frames = frame_count - last_active - 1
    if trailing_frames <= int(MAX_TRAILING_SILENCE_SECONDS * PCM_SAMPLE_RATE):
        return audio, 0

    keep_frames = min(
        frame_count,
        last_active + 1
        + int(KEPT_TRAILING_SILENCE_SECONDS * PCM_SAMPLE_RATE),
    )
    removed_frames = frame_count - keep_frames
    return (
        audio[:keep_frames * PCM_SAMPLE_WIDTH],
        round(removed_frames * 1000 / PCM_SAMPLE_RATE),
    )


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
        raise RuntimeError("Alibaba returned no cloned voice ID") from exc


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


def _event_transcript(event: dict) -> str | None:
    """Read a complete transcript only as fallback for absent text deltas."""
    candidates = []
    for choice in event.get("choices") or []:
        message = (choice or {}).get("delta") or (choice or {}).get("message") or {}
        candidates.append(message.get("audio"))
    output = event.get("output") or {}
    candidates.append(output.get("audio"))
    for choice in output.get("choices") or []:
        message = (choice or {}).get("message") or {}
        candidates.append(message.get("audio"))
    for candidate in candidates:
        if isinstance(candidate, dict) and isinstance(candidate.get("transcript"), str):
            return candidate["transcript"]
    return None


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
                 speech_mode: str = "exact") -> ChunkResponse:
    # Omni is a conversational Thinker/Talker, not a literal TTS endpoint.  A
    # bare fragment is answered instead of read.  Keep the steering minimal and
    # entirely inside the single documented user message: no system role, XML
    # wrapper, Composer metadata or model-specific hidden flags.
    direction = (f" Performance direction: {instruction}."
                 if speech_mode == "directed" and instruction else "")
    prompt = (
        "Read aloud exactly the passage between BEGIN PASSAGE and END PASSAGE."
        f"{direction} Do not skip, summarize, translate, repeat, answer, "
        "explain, introduce, or add any words. Output only the passage.\n\n"
        f"BEGIN PASSAGE\n{text}\nEND PASSAGE"
    )
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
    # Qwen3.5-Omni defaults presence_penalty to 1.5. Every Audio Studio speech
    # mode must preserve intentional script repetition, including Directed
    # performance, so opt out explicitly rather than inheriting that default.
    payload["presence_penalty"] = 0.0
    audio_base64 = []
    returned_text = []
    response_shapes = set()
    event_count = 0
    usage = {}
    request_id = None
    finish_reason = None
    fallback_transcript = None
    for event in _stream_events(payload, key):
        event_count += 1
        request_id = request_id or event.get("id") or event.get("request_id")
        if not request_id and isinstance(event.get("output"), dict):
            request_id = event["output"].get("request_id")
        output = event.get("output") or {}
        for choice in [*(event.get("choices") or []),
                       *(output.get("choices") or [])]:
            if choice and choice.get("finish_reason") is not None:
                finish_reason = str(choice["finish_reason"])
        fallback_transcript = _event_transcript(event) or fallback_transcript
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
    combined_text = "".join(returned_text) or (fallback_transcript or "")
    return ChunkResponse(
        base64.b64decode("".join(audio_base64)),
        combined_text, measured,
        str(request_id) if request_id else None,
        finish_reason, event_count,
    )


def plan_passages(chunks) -> list[str]:
    """Plan short semantic Omni requests before any paid provider call."""
    return [passage for chunk in chunks
            for passage in speech_text.chunk_text(
                str(chunk), limit=PASSAGE_TARGET_CHARS)]


def _recovery_passages(text: str) -> list[str]:
    """Split one incomplete planned passage once, at a semantic boundary."""
    children = speech_text.chunk_text(text, limit=RECOVERY_TARGET_CHARS)
    return children if len(children) > 1 else []


def _is_complete(fidelity: dict) -> bool:
    """Require every normalized word, not merely the UI review threshold."""
    return (fidelity.get("coverage") == 1.0
            and fidelity.get("precision") == 1.0)


def synthesize(chunks, options, on_progress=None):
    passages = plan_passages(chunks)
    pcm = bytearray()
    failures = []
    transcripts = []
    diagnostics = []
    request_ids = []
    usage = {kind: 0 for kind in
             ("input_text", "input_audio", "output_text", "output_audio", "total")}

    def call(text: str, root_index: int, path: str,
             attempt: int) -> tuple[bytes, str, bool, bool]:
        try:
            response = _speak_chunk(
                text, options.model_id, options.voice, options.instruction,
                getattr(options, "speech_mode", "exact"))
        except Exception as exc:
            diagnostics.append({
                "segment": root_index, "path": path, "attempt": attempt,
                "requested_text": text, "returned_text": "",
                "request_id": None, "finish_reason": None,
                "event_count": 0, "usage": {}, "status": "error",
                "error": f"{type(exc).__name__}: {exc}",
            })
            failures.append(ChunkFailure(
                root_index, text, f"{type(exc).__name__}: {exc}"))
            # A transport, authentication or provider error is not evidence
            # that the passage was too long.  Do not split it and accidentally
            # turn one failed request into several paid requests.
            return b"", "", False, True

        if response.request_id:
            request_ids.append(response.request_id)
        for kind in usage:
            usage[kind] += int(response.usage.get(kind) or 0)
        accepted_audio, trimmed_silence_ms = (
            _trim_pathological_trailing_silence(response.audio)
        )
        fidelity = speech_fidelity.assess(text, response.text)
        complete = _is_complete(fidelity)
        diagnostic = {
            "segment": root_index, "path": path, "attempt": attempt,
            "requested_text": text, "returned_text": response.text,
            "request_id": response.request_id,
            "finish_reason": response.finish_reason,
            "event_count": response.event_count,
            "usage": response.usage,
            "fidelity": fidelity,
            "audio_duration_ms": round(
                len(response.audio) * 1000
                / (PCM_SAMPLE_RATE * PCM_SAMPLE_WIDTH)),
            "trimmed_trailing_silence_ms": trimmed_silence_ms,
            "status": "accepted" if complete else "incomplete",
        }
        diagnostics.append(diagnostic)
        return (accepted_audio if complete else b"", response.text,
                complete, False)

    def render(text: str, root_index: int,
               path: str) -> tuple[bytes, str, bool]:
        audio, returned, complete, provider_error = call(
            text, root_index, path, 1)
        if complete:
            return audio, returned, True
        if provider_error:
            return b"", "", False

        children = _recovery_passages(text)
        if not children:
            # One bounded repeat is useful for a short non-deterministic Omni
            # omission. It repeats the identical request and never changes the
            # operator's words.
            audio, returned, complete, provider_error = call(
                text, root_index, path, 2)
            if complete:
                return audio, returned, True
            if provider_error:
                return b"", "", False
            failures.append(ChunkFailure(
                root_index, text,
                "Alibaba returned incomplete speech for this passage."))
            return b"", "", False

        diagnostics[-1]["status"] = "replaced"
        diagnostics[-1]["recovery_segments"] = len(children)
        recovered_audio = bytearray()
        recovered_text = []
        for child_index, child in enumerate(children, 1):
            child_audio, child_text, child_complete, provider_error = call(
                child, root_index, f"{path}.{child_index}", 1)
            if provider_error:
                return b"", "", False
            if not child_complete:
                child_audio, child_text, child_complete, provider_error = call(
                    child, root_index, f"{path}.{child_index}",
                    MAX_ATTEMPTS_PER_PASSAGE)
                if provider_error:
                    return b"", "", False
            if not child_complete:
                failures.append(ChunkFailure(
                    root_index, child,
                    "Alibaba returned incomplete speech for this passage."))
                return b"", "", False
            recovered_audio.extend(child_audio)
            recovered_text.append(child_text)
        return bytes(recovered_audio), " ".join(recovered_text), True

    for index, chunk in enumerate(passages, 1):
        if on_progress:
            on_progress(index, len(passages), chunk)
        audio, returned, complete = render(chunk, index, str(index))
        if complete:
            pcm.extend(audio)
            transcripts.append(returned)
        else:
            detail = failures[-1].error if failures else "incomplete speech"
            raise OmniSynthesisError(
                detail, failures=failures, usage=usage,
                request_ids=request_ids, diagnostics=diagnostics)
    return (_encode(bytes(pcm), options.format), failures, transcripts, usage,
            request_ids, diagnostics)
