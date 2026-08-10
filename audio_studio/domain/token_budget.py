"""Conservative text budgeting when a provider exposes no tokenizer API."""

from __future__ import annotations

import math
import re

from audio_studio.domain import speech_segments


_UNITS = re.compile(r"[A-Za-z0-9_]+|[^\x00-\x7f]|[^\w\s]", re.UNICODE)


def conservative_qwen_tokens(text: str) -> int:
    """Upper-biased estimate for hosted Qwen-TTS request planning.

    Alibaba documents a token limit but publishes no callable tokenizer for
    the hosted speech model. Every non-ASCII codepoint and punctuation mark is
    treated as one token; ASCII runs use one token per four characters. The
    provider response remains the final authority.
    """
    total = 0
    for unit in _UNITS.findall(str(text or "")):
        total += (math.ceil(len(unit) / 4)
                  if unit.isascii() and re.fullmatch(r"[A-Za-z0-9_]+", unit)
                  else 1)
    return total


def split_to_budget(text: str, *, budget: int) -> list[str]:
    if budget < 1:
        raise ValueError("Token budget must be positive.")
    remaining = str(text or "").strip()
    segments: list[str] = []
    while remaining:
        if conservative_qwen_tokens(remaining) <= budget:
            segments.append(remaining)
            break
        low, high = 1, len(remaining)
        while low < high:
            middle = (low + high + 1) // 2
            if conservative_qwen_tokens(remaining[:middle]) <= budget:
                low = middle
            else:
                high = middle - 1
        first = speech_segments.split_text(
            remaining, limit=max(1, low))[0]
        segments.append(first)
        remaining = remaining[len(first):].lstrip()
    return segments
