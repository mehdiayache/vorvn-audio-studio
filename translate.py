"""Legacy multilingual-speech facade for the native Qwen-MT translator."""

from audio_studio.application.translation import (
    BATCH_SIZE as BATCH,
    LANGUAGES,
    MODELS,
    SPEAKABLE,
    UNRELIABLE_SPEECH,
    Translator,
)
from audio_studio.infrastructure.alibaba.translation import (
    AlibabaTranslationProvider,
)


_translator = Translator(AlibabaTranslationProvider())


def translate_text(text: str, target: str, source: str | None = None,
                   model: str = "fast") -> str:
    return _translator.translate_text(text, target, source, model)


def translate_lines(lines: list, target: str, source: str | None = None,
                    model: str = "fast", on_progress=None) -> list:
    return _translator.translate_lines(
        lines, target, source, model, on_progress).lines
