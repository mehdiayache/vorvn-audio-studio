"""CosyVoice V3 Plus synthesis for the Singapore workspace route."""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import NamedTuple

from dashscope.audio.tts_v2 import AudioFormat, ResultCallback, SpeechSynthesizer

from audio_studio.domain import provider_catalog, speech_segments
from audio_studio.infrastructure import audio_codec
from audio_studio.providers.alibaba.sdk_runtime import apply_credentials


TEXT_PER_SEND = int(provider_catalog.SEGMENTATION["cosyvoice"]
                    ["characters_per_submission"])
TEXT_PER_SESSION = int(provider_catalog.SEGMENTATION["cosyvoice"]
                       ["characters_per_session"])
PCM_SAMPLE_RATE = 48_000


class ChunkFailure(NamedTuple):
    index: int
    text: str
    error: str


@dataclass(frozen=True, slots=True)
class CosyVoicePlan:
    sessions: tuple[tuple[str, ...], ...]
    ssml: bool = False

    @property
    def request_count(self) -> int:
        return len(self.sessions)


def _validate_ssml(text: str) -> None:
    if "<!doctype" in text.casefold() or "<!entity" in text.casefold():
        raise ValueError("SSML document declarations and entities are not supported.")
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise ValueError(f"The SSML is not valid XML: {error}.") from error
    if root.tag.rsplit("}", 1)[-1].casefold() != "speak":
        raise ValueError("SSML must have one <speak> root element.")


def plan(text: str, *, ssml: bool = False) -> CosyVoicePlan:
    """Plan provider tasks without splitting a single SSML document."""
    if ssml:
        _validate_ssml(text)
        if len(text) > TEXT_PER_SEND:
            raise ValueError(
                f"One CosyVoice SSML document cannot exceed {TEXT_PER_SEND:,} characters.")
        return CosyVoicePlan(((text,),), ssml=True)
    segments = speech_segments.split_text(text, limit=TEXT_PER_SEND)
    sessions = speech_segments.group_by_size(segments, limit=TEXT_PER_SESSION)
    return CosyVoicePlan(tuple(tuple(session) for session in sessions))


def _word_rows(value) -> list[dict]:
    rows: list[dict] = []
    if isinstance(value, dict):
        words = value.get("words")
        if isinstance(words, list):
            for word in words:
                if not isinstance(word, dict):
                    continue
                rows.append({
                    key: word.get(key) for key in
                    ("text", "begin_time", "end_time", "begin_index", "end_index")
                    if word.get(key) is not None
                })
        for child in value.values():
            rows.extend(_word_rows(child))
    elif isinstance(value, list):
        for child in value:
            rows.extend(_word_rows(child))
    return rows


class _CosyVoiceCollector(ResultCallback):
    def __init__(self):
        self.audio = bytearray()
        self.error: str | None = None
        self._word_timestamps: dict[tuple, dict] = {}

    @property
    def word_timestamps(self) -> list[dict]:
        return sorted(
            self._word_timestamps.values(),
            key=lambda item: (
                int(item.get("begin_index") or 0),
                int(item.get("begin_time") or 0),
            ),
        )

    def on_data(self, data: bytes) -> None:
        self.audio.extend(data)

    def on_error(self, message) -> None:
        self.error = str(message)

    def on_event(self, message) -> None:
        try:
            payload = json.loads(message) if isinstance(message, str) else message
        except (TypeError, json.JSONDecodeError):
            return
        # Result-generated events are cumulative and may revise a word's end
        # timing. Keep one latest provider row per script span instead of
        # persisting every intermediate repetition.
        for row in _word_rows(payload):
            key = (
                row.get("begin_index"), row.get("end_index"), row.get("text"),
            )
            self._word_timestamps[key] = row


def _language_hints(language: str | None) -> list[str] | None:
    requested = str(language or "").casefold()
    for code, label in provider_catalog.COSYVOICE_CLONE_LANGUAGES.items():
        if requested in {code.casefold(), label.casefold()}:
            return [code]
    return None


def _synthesizer(options, *, callback: ResultCallback,
                 ssml: bool) -> SpeechSynthesizer:
    if not 0 <= int(options.seed) <= 65_535:
        raise ValueError("CosyVoice seed must be between 0 and 65,535.")
    additional_params = {"word_timestamp_enabled": True}
    if ssml:
        additional_params["enable_ssml"] = True
    return SpeechSynthesizer(
        model=provider_catalog.CAPABILITIES["cosyvoice"]["models"][options.model],
        voice=options.voice,
        format=AudioFormat.PCM_48000HZ_MONO_16BIT,
        speech_rate=options.rate,
        pitch_rate=options.pitch,
        volume=options.volume,
        seed=options.seed,
        language_hints=_language_hints(options.language),
        hot_fix=getattr(options, "hot_fix", None),
        additional_params=additional_params,
        callback=callback,
    )


def _render_session(session: tuple[str, ...], options, *, ssml: bool):
    collector = _CosyVoiceCollector()
    synthesizer = _synthesizer(options, callback=collector, ssml=ssml)
    for text in session:
        synthesizer.streaming_call(text)
    synthesizer.streaming_complete()
    if collector.error:
        raise RuntimeError(collector.error)
    if not collector.audio:
        raise RuntimeError("the model returned no audio")
    return (bytes(collector.audio), synthesizer.get_last_request_id(),
            collector.word_timestamps)


def synthesize(plan: CosyVoicePlan, options, on_progress=None):
    """Render atomically; do not retry an ambiguous paid WebSocket request."""
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
            print(f"  [{index}/{len(plan.sessions)}] {preview[:60]}...", file=sys.stderr)
        try:
            audio, request_id, word_timestamps = _render_session(
                session, options, ssml=plan.ssml)
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            failures.append(ChunkFailure(index, preview, message))
            diagnostics.append({
                "session": index, "request_id": None,
                "characters": len(preview), "submissions": len(session),
                "attempts": 1, "status": "failed", "error": message,
            })
            return b"", failures, [], {}, request_ids, diagnostics
        pcm.extend(audio)
        if request_id:
            request_ids.append(request_id)
        diagnostics.append({
            "session": index, "request_id": request_id,
            "characters": sum(len(item) for item in session),
            "submissions": len(session), "attempts": 1,
            "status": "accepted", "word_timestamps": word_timestamps,
        })
    encoded = audio_codec.encode_pcm(
        bytes(pcm), sample_rate=PCM_SAMPLE_RATE,
        output_format=options.format) if pcm else b""
    return encoded, failures, [], {}, request_ids, diagnostics
