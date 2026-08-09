"""Qwen Audio TTS SDK execution with bounded retry and partial recovery."""

from __future__ import annotations

import sys
import time
from typing import NamedTuple

from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer

from audio_studio.domain import provider_catalog, speech_text
from audio_studio.infrastructure.alibaba.sdk_runtime import apply_credentials


FORMATS = {
    "mp3": AudioFormat.MP3_48000HZ_MONO_256KBPS,
    "mp3-24k": AudioFormat.MP3_24000HZ_MONO_256KBPS,
    "wav": AudioFormat.WAV_48000HZ_MONO_16BIT,
    "opus": AudioFormat.OGG_OPUS_48KHZ_MONO_64KBPS,
}
RETRIES = 3
BACKOFF = 1.5
FATAL_SIGNS = (
    "apikey", "api key", "unauthorized", "invalid api", "accessdenied",
    "forbidden", "arrearage", "invalidparameter", "model not exist",
    "voice not exist", "no permission",
)


class ChunkFailure(NamedTuple):
    index: int
    text: str
    error: str


def build_additional_params(options) -> dict | None:
    params = {}
    for flag in speech_text.SYNTH_FLAGS:
        value = getattr(options, flag, None)
        if value is not None:
            params[flag] = bool(value)
    hot_fix = getattr(options, "hot_fix", None)
    if hot_fix:
        params["hot_fix"] = hot_fix
    extra = getattr(options, "extra_params", None)
    if isinstance(extra, dict):
        params.update(extra)
    return params or None


def _render_chunk(text: str, options) -> bytes:
    synthesizer = SpeechSynthesizer(
        model=provider_catalog.CAPABILITIES["audio"]["models"][options.model],
        voice=options.voice,
        format=FORMATS[options.format],
        speech_rate=options.rate,
        pitch_rate=options.pitch,
        volume=options.volume,
        instruction=options.instruction,
        language_hints=[options.language] if options.language else None,
        seed=getattr(options, "seed", 0),
        additional_params=build_additional_params(options),
    )
    result = synthesizer.call(text)
    if not result:
        raise RuntimeError("the model returned no audio")
    return result


def _is_fatal(message: str) -> bool:
    lowered = message.lower()
    return any(sign in lowered for sign in FATAL_SIGNS)


def synthesize(chunks, options, on_progress=None, retries: int = RETRIES):
    """Render chunks in order, salvaging earlier audio after later failures."""
    apply_credentials()
    audio = bytearray()
    failures: list[ChunkFailure] = []
    for index, chunk in enumerate(chunks, 1):
        if on_progress:
            on_progress(index, len(chunks), chunk)
        elif len(chunks) > 1:
            print(f"  [{index}/{len(chunks)}] {chunk[:60]}...", file=sys.stderr)

        rendered = False
        last_error = ""
        for attempt in range(1, retries + 1):
            try:
                audio.extend(_render_chunk(chunk, options))
                rendered = True
                break
            except Exception as error:
                last_error = f"{type(error).__name__}: {error}"
                if _is_fatal(last_error):
                    if not audio:
                        raise RuntimeError(
                            f"{last_error}\nCheck your API key, and that voice "
                            f"'{options.voice}' exists on the {options.model} tier."
                        ) from error
                    break
                if attempt < retries:
                    time.sleep(BACKOFF * 2 ** (attempt - 1))
        if not rendered:
            failures.append(ChunkFailure(index, chunk, last_error))
    return bytes(audio), failures
