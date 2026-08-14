"""Qwen Audio TTS execution using provider-native continuous sessions."""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from typing import NamedTuple

from dashscope.audio.tts_v2 import AudioFormat, ResultCallback, SpeechSynthesizer

from audio_studio.domain import (
    delivery_tags,
    provider_catalog,
    speech_segments,
    speech_text,
)
from audio_studio.infrastructure import audio_codec
from audio_studio.infrastructure.alibaba.sdk_runtime import apply_credentials


# A transport failure after opening a paid synthesis request is ambiguous.
# Retrying it here could bill the same segment twice without operator consent.
RETRIES = 1
BACKOFF = 1.5
TEXT_PER_SEND = int(provider_catalog.SEGMENTATION["audio"]
                    ["characters_per_submission"])
TEXT_PER_SESSION = int(provider_catalog.SEGMENTATION["audio"]
                       ["characters_per_session"])
PCM_SAMPLE_RATE = 48_000
FATAL_SIGNS = (
    "apikey", "api key", "unauthorized", "invalid api", "accessdenied",
    "forbidden", "arrearage", "invalidparameter", "model not exist",
    "voice not exist", "no permission",
)


class ChunkFailure(NamedTuple):
    index: int
    text: str
    error: str


@dataclass(frozen=True, slots=True)
class AudioPlan:
    """One or more Alibaba tasks, each containing ordered text submissions."""

    sessions: tuple[tuple[str, ...], ...]

    @property
    def request_count(self) -> int:
        return len(self.sessions)

    @property
    def segment_count(self) -> int:
        return sum(len(session) for session in self.sessions)


class _PcmCollector(ResultCallback):
    def __init__(self):
        self.audio = bytearray()
        self.error: str | None = None

    def on_data(self, data: bytes) -> None:
        self.audio.extend(data)

    def on_error(self, message) -> None:
        self.error = str(message)


def plan(text: str) -> AudioPlan:
    """Keep normal scripts in one task and respect Alibaba's native limits."""
    segments = speech_segments.split_text(text, limit=TEXT_PER_SEND)
    segments = _carry_mood_tags(segments, limit=TEXT_PER_SEND)
    sessions = speech_segments.group_by_size(
        segments, limit=TEXT_PER_SESSION)
    return AudioPlan(tuple(tuple(session) for session in sessions))


def _active_mood(text: str) -> str | None:
    found = [match for match in delivery_tags.TAG_RE.findall(text)
             if match.casefold() in delivery_tags.MOOD_TAGS
             or match.casefold() in delivery_tags.RETIRED_TAGS]
    return found[-1] if found else None


def _carry_mood_tags(segments: list[str], *, limit: int) -> list[str]:
    """Carry Audio TTS mood state when a provider submission is bounded."""
    carried: list[str] = []
    mood = None
    for index, segment in enumerate(segments):
        opening = delivery_tags.TAG_RE.match(segment.lstrip())
        starts_with_mood = bool(
            opening and opening.group(1).casefold() in delivery_tags.MOOD_TAGS)
        candidate = (segment if index == 0 or not mood or starts_with_mood
                     else f"[{mood}] {segment}")
        while len(candidate) > limit:
            cut = candidate.rfind(" ", 0, limit + 1)
            cut = cut if cut > limit // 2 else limit
            bounded = candidate[:cut].strip()
            carried.append(bounded)
            mood = _active_mood(bounded) or mood
            remainder = candidate[cut:].strip()
            opening = delivery_tags.TAG_RE.match(remainder)
            candidate = (
                remainder if not mood or (
                    opening and opening.group(1).casefold()
                    in delivery_tags.MOOD_TAGS)
                else f"[{mood}] {remainder}"
            )
        if candidate:
            carried.append(candidate)
            mood = _active_mood(candidate) or mood
    return carried


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


def _language_hints(language: str | None) -> list[str] | None:
    """Translate the UI label to Alibaba's documented Audio language code.

    Experimental languages deliberately omit the hint so the model can
    auto-detect them instead of receiving an invalid provider parameter.
    """
    requested = str(language or "").casefold()
    for code, label in provider_catalog.AUDIO_CLONE_LANGUAGES.items():
        if requested in {code.casefold(), label.casefold()}:
            return [code]
    return None


def _synthesizer(options, *, callback: ResultCallback) -> SpeechSynthesizer:
    return SpeechSynthesizer(
        model=provider_catalog.CAPABILITIES["audio"]["models"][options.model],
        voice=options.voice,
        format=AudioFormat.PCM_48000HZ_MONO_16BIT,
        speech_rate=options.rate,
        pitch_rate=options.pitch,
        volume=options.volume,
        instruction=options.instruction,
        language_hints=_language_hints(options.language),
        seed=getattr(options, "seed", 0),
        additional_params=build_additional_params(options),
        callback=callback,
    )


def _render_session(segments: tuple[str, ...], options) -> tuple[bytes, str | None]:
    collector = _PcmCollector()
    synthesizer = _synthesizer(options, callback=collector)
    for text in segments:
        synthesizer.streaming_call(text)
    synthesizer.streaming_complete()
    if collector.error:
        raise RuntimeError(collector.error)
    if not collector.audio:
        raise RuntimeError("the model returned no audio")
    return bytes(collector.audio), synthesizer.get_last_request_id()


def _is_fatal(message: str) -> bool:
    lowered = message.lower()
    return any(sign in lowered for sign in FATAL_SIGNS)


def synthesize(plan: AudioPlan, options, on_progress=None,
               retries: int = RETRIES):
    """Render atomically; an incomplete provider task never becomes a Clip."""
    apply_credentials()
    pcm = bytearray()
    failures: list[ChunkFailure] = []
    request_ids: list[str] = []
    diagnostics: list[dict] = []
    for index, session in enumerate(plan.sessions, 1):
        preview = "\n\n".join(session)
        if on_progress:
            on_progress(index, len(plan.sessions), preview)
        elif len(plan.sessions) > 1:
            print(f"  [{index}/{len(plan.sessions)}] {preview[:60]}...",
                  file=sys.stderr)

        rendered = False
        last_error = ""
        for attempt in range(1, retries + 1):
            try:
                audio, request_id = _render_session(session, options)
                pcm.extend(audio)
                if request_id:
                    request_ids.append(request_id)
                diagnostics.append({
                    "session": index,
                    "request_id": request_id,
                    "characters": sum(len(item) for item in session),
                    "submissions": len(session),
                    "attempts": attempt,
                    "status": "accepted",
                })
                rendered = True
                break
            except Exception as error:
                last_error = f"{type(error).__name__}: {error}"
                if _is_fatal(last_error):
                    break
                if attempt < retries:
                    time.sleep(BACKOFF * 2 ** (attempt - 1))
        if not rendered:
            failed_text = "\n\n".join(session)
            failures.append(ChunkFailure(index, failed_text, last_error))
            diagnostics.append({
                "session": index,
                "request_id": None,
                "characters": len(failed_text),
                "submissions": len(session),
                "attempts": attempt,
                "status": "failed",
                "error": last_error,
            })
            return b"", failures, [], {}, request_ids, diagnostics
    return (
        audio_codec.encode_pcm(
            bytes(pcm), sample_rate=PCM_SAMPLE_RATE,
            output_format=options.format) if pcm else b"",
        failures, [], {}, request_ids, diagnostics,
    )
