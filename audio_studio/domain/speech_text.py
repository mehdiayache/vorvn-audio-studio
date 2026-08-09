"""Pure text preparation policy shared by every speech workflow."""

from __future__ import annotations

import re

from audio_studio.domain.delivery_tags import (
    KNOWN_TAGS,
    MOOD_TAGS,
    RETIRED_TAGS,
    TAG_RE,
)


OUTPUT_FORMATS = ("mp3", "mp3-24k", "wav", "opus")
MAX_CHARS = 500
SYNTH_FLAGS = {
    "enable_tn": "Read numbers, dates, currency and units the way a person would",
    "optimize_instructions": "Let the model refine your performance direction first",
    "enable_markdown_filter": "Strip markdown syntax instead of reading it aloud",
    "enable_ssml": "Treat the text as SSML markup",
}


def active_mood(text: str) -> str | None:
    found = [match for match in TAG_RE.findall(text)
             if match.lower() in MOOD_TAGS or match.lower() in RETIRED_TAGS]
    return found[-1] if found else None


def strip_tags(text: str) -> str:
    return re.sub(r"\s{2,}", " ", TAG_RE.sub("", text)).strip()


def strip_known_tags(text: str) -> str:
    cleaned = TAG_RE.sub(
        lambda match: "" if match.group(1).lower() in KNOWN_TAGS
        else match.group(0), text)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def chunk_text(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Split at speech boundaries while carrying a continuing mood tag."""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return [text] if text else []

    sentences = re.split(r"(?<=[.!?。！？\n])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        while len(sentence) > limit:
            cut = sentence.rfind(",", 0, limit)
            if cut > limit // 2:
                cut += 1
            else:
                space = sentence.rfind(" ", 0, limit + 1)
                cut = space if space > limit // 2 else limit
            chunks.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if len(current) + len(sentence) + 1 > limit:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current.strip())

    carried: list[str] = []
    mood = None
    for index, chunk in enumerate(chunks):
        opening = TAG_RE.match(chunk.lstrip())
        starts_with_mood = bool(
            opening and opening.group(1).lower() in MOOD_TAGS)
        candidate = (chunk if index == 0 or not mood or starts_with_mood
                     else f"[{mood}] {chunk}")
        while len(candidate) > limit:
            cut = candidate.rfind(" ", 0, limit + 1)
            cut = cut if cut > limit // 2 else limit
            segment = candidate[:cut].strip()
            carried.append(segment)
            mood = active_mood(segment) or mood
            remainder = candidate[cut:].strip()
            opening = TAG_RE.match(remainder)
            candidate = (
                remainder if not mood or (
                    opening and opening.group(1).lower() in MOOD_TAGS)
                else f"[{mood}] {remainder}"
            )
        if candidate:
            carried.append(candidate)
            mood = active_mood(candidate) or mood
    return carried


MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")
DATE_RE = re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b")
PHONE_RE = re.compile(
    r"(?<![\d\-/])(\+\s*)?(?:\d{1,3}[ -])?(?:\(\d{3}\)\s*|\d{3}[ -])?\d{3}[ -]\d{4}(?![\d\-/])"
)


def _spell_digits(match: re.Match) -> str:
    digits = " ".join(character for character in match.group(0)
                      if character.isdigit())
    return f"plus {digits}" if match.group(1) else digits


def normalise_ambiguous(text: str, day_first: bool = True) -> tuple[str, list]:
    changes = []

    def date_sub(match):
        first, second, year = (int(match.group(index)) for index in (1, 2, 3))
        day, month = (first, second) if day_first else (second, first)
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return match.group(0)
        result = f"{day} {MONTHS[month - 1]} {year}"
        changes.append((match.group(0), result))
        return result

    text = DATE_RE.sub(date_sub, text)

    def phone_sub(match):
        result = _spell_digits(match)
        changes.append((match.group(0), result))
        return result

    return PHONE_RE.sub(phone_sub, text), changes


def build_hot_fix(rules: list[dict]) -> dict | None:
    entries = [{rule["pattern"]: rule["replacement"]}
               for rule in rules if rule.get("phoneme")]
    return {"pronunciation": entries} if entries else None


def apply_pronunciations(text: str, rules: list[dict]) -> tuple[str, list]:
    applied = []
    for rule in rules:
        if rule.get("phoneme"):
            continue
        pattern = re.escape(rule["pattern"])
        if rule.get("whole_word"):
            if re.match(r"\w", rule["pattern"]):
                pattern = r"\b" + pattern
            if re.search(r"\w$", rule["pattern"]):
                pattern += r"\b"
        flags = 0 if rule.get("match_case") else re.IGNORECASE
        text, count = re.subn(
            pattern, rule["replacement"].replace("\\", r"\\"),
            text, flags=flags)
        if count:
            applied.append({
                "pattern": rule["pattern"],
                "replacement": rule["replacement"],
                "count": count,
            })
    return text, applied


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:40].rstrip("-") or "speech"
