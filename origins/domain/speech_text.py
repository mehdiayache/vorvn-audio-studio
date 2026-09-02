"""Pure text preparation policy shared by every speech workflow."""

from __future__ import annotations

import re

from origins.domain.delivery_tags import (
    KNOWN_TAGS,
    TAG_RE,
)


OUTPUT_FORMATS = ("mp3", "mp3-24k", "wav", "opus")
SYNTH_FLAGS = {
    "enable_tn": "Read numbers, dates, currency and units the way a person would",
    "optimize_instructions": "Let the model refine your performance direction first",
    "enable_markdown_filter": "Strip markdown syntax instead of reading it aloud",
    "enable_ssml": "Treat the text as SSML markup",
}


def strip_tags(text: str) -> str:
    return re.sub(r"\s{2,}", " ", TAG_RE.sub("", text)).strip()


def strip_known_tags(text: str) -> str:
    cleaned = TAG_RE.sub(
        lambda match: "" if match.group(1).lower() in KNOWN_TAGS
        else match.group(0), text)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


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
