"""Compatibility facade for caption rendering and direct ASR callers."""

from audio_studio.application.transcription import QWEN_MODEL as MODEL
from audio_studio.infrastructure.alibaba.transcription import (
    AlibabaTranscriptionProvider,
    LANGUAGE_CODES,
    parse,
)
from audio_studio.domain import captions


def transcribe(url: str, language: str | None = None, words: bool = True,
               vocabulary_id: str | None = None,
               enable_itn: bool = False) -> dict:
    result = AlibabaTranscriptionProvider().transcribe(
        url=url, language=language, words=words,
        vocabulary_id=vocabulary_id, enable_itn=enable_itn)
    return {"text": result.text, "sentences": result.sentences,
            "duration_ms": result.duration_ms}


MAX_LINE = 42
MAX_LINES = 2
MIN_CUE_MS = 800


def _timestamp(ms: int, comma: bool = True) -> str:
    return captions._timestamp(ms, comma)


def _wrap(text: str) -> str:
    return captions._wrap(text, MAX_LINE, MAX_LINES)


def _split_without_timings(text: str, start: int, end: int) -> list:
    return captions.build_cues(
        [{"text": text, "start": start, "end": end}], "standard")


def to_cues(result: dict) -> list:
    return captions.build_cues(result, "standard")


def render_srt(cues: list) -> str:
    return captions.render_srt(cues)


def render_vtt(cues: list) -> str:
    return captions.render_vtt(cues)


def to_srt(result: dict) -> str:
    return render_srt(to_cues(result))


def to_vtt(result: dict) -> str:
    return render_vtt(to_cues(result))
