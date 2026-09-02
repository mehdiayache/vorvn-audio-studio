"""Unicode-aware, provider-neutral boundaries for speech text.

This module knows how to preserve an operator's text while finding natural
places to hand work to a provider.  It deliberately does not choose limits:
each provider adapter owns its own request contract.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata


_PARAGRAPH = re.compile(r"\n[ \t]*\n+")
_LINE = re.compile(r"\n+")
_SENTENCE = re.compile(r"[.!?。！？؟]+(?:[\"'’”»）\])]*)[ \t\n]+")
_CLAUSE = re.compile(r"[,،;؛:]+(?:[\"'’”»）\])]*)[ \t\n]+")
_SPACE = re.compile(r"[ \t]+")


@dataclass(frozen=True, slots=True)
class Boundary:
    end: int
    kind: str


def _last_boundary(window: str, minimum: int) -> Boundary | None:
    """Return the strongest usable boundary nearest the end of ``window``."""
    for kind, pattern in (
        ("paragraph", _PARAGRAPH),
        ("line", _LINE),
        ("sentence", _SENTENCE),
        ("clause", _CLAUSE),
        ("workspace", _SPACE),
    ):
        matches = [match for match in pattern.finditer(window)
                   if match.end() >= minimum]
        if matches:
            return Boundary(matches[-1].end(), kind)
    return None


def _safe_codepoint_cut(text: str, index: int) -> int:
    """Avoid starting a segment with a combining mark or ZWJ continuation."""
    index = min(max(1, index), len(text))
    while index > 1 and index < len(text) and (
            unicodedata.combining(text[index]) or text[index] == "\u200d"):
        index -= 1
    return index


def split_text(text: str, *, limit: int,
               minimum_fill: float = 0.45) -> list[str]:
    """Split without flattening paragraphs or losing non-whitespace content.

    Boundaries are preferred in this order: paragraph, line, sentence,
    clause, space, and finally a Unicode-safe hard boundary. Leading/trailing
    whitespace at a provider boundary is discarded because it carries no
    spoken content; whitespace inside a segment is preserved verbatim.
    """
    if limit < 1:
        raise ValueError("Speech segment limit must be positive.")
    remaining = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    remaining = remaining.strip()
    if not remaining:
        return []

    segments: list[str] = []
    while len(remaining) > limit:
        window = remaining[:limit + 1]
        minimum = max(1, min(limit, round(limit * minimum_fill)))
        boundary = _last_boundary(window[:limit], minimum)
        cut = boundary.end if boundary else _safe_codepoint_cut(remaining, limit)
        segment = remaining[:cut].strip()
        if not segment:
            cut = _safe_codepoint_cut(remaining, limit)
            segment = remaining[:cut].strip()
        segments.append(segment)
        remaining = remaining[cut:].lstrip()
    if remaining:
        segments.append(remaining.rstrip())
    return segments


def paragraphs(text: str) -> list[str]:
    """Return authored paragraphs without flattening their internal lines."""
    normalized = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    return [part.strip() for part in _PARAGRAPH.split(normalized)
            if part.strip()]


def group_by_size(segments: list[str], *, limit: int) -> list[list[str]]:
    """Pack ordered segments into provider sessions without rewriting them."""
    groups: list[list[str]] = []
    current: list[str] = []
    size = 0
    for segment in segments:
        additional = len(segment) + (1 if current else 0)
        if current and size + additional > limit:
            groups.append(current)
            current, size = [], 0
        current.append(segment)
        size += len(segment) + (1 if len(current) > 1 else 0)
    if current:
        groups.append(current)
    return groups


def comparable_text(parts: list[str]) -> str:
    """Normalize only boundary whitespace when proving that no words vanished."""
    return " ".join(" ".join(part.split()) for part in parts).strip()
