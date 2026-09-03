"""Pure subtitle layout and export policy.

Recognition is the expensive, canonical step.  These helpers only reshape the
stored sentence/word timings, so an operator can switch presentation styles
without transcribing the audio again.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
import re
from typing import Iterable


@dataclass(frozen=True)
class CaptionProfile:
    key: str
    label: str
    description: str
    max_words: int
    max_chars: int
    line_chars: int
    max_lines: int
    min_duration_ms: int
    max_duration_ms: int


PROFILES = {
    "standard": CaptionProfile(
        "standard", "Standard", "Readable subtitles, up to two lines",
        max_words=16, max_chars=84, line_chars=42, max_lines=2,
        min_duration_ms=800, max_duration_ms=6000,
    ),
    "short": CaptionProfile(
        "short", "Short", "Fast, compact captions of roughly 2–5 words",
        max_words=5, max_chars=32, line_chars=32, max_lines=1,
        min_duration_ms=500, max_duration_ms=2500,
    ),
    "words": CaptionProfile(
        "words", "Word by word", "One timed word per cue for precise editing",
        max_words=1, max_chars=80, line_chars=80, max_lines=1,
        min_duration_ms=120, max_duration_ms=2000,
    ),
}

_CJK = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")
_PUNCTUATION = re.compile(r"^[\s.,!?;:،؛؟…。，！？：；]+$")
_BREAK = re.compile(r"[.!?،؛؟…。，！？：；]$|[,;:]$")


def profile(key: str) -> CaptionProfile:
    try:
        return PROFILES[key]
    except KeyError as error:
        raise ValueError(f"Unknown caption profile: {key}") from error


def _join(tokens: Iterable[dict]) -> str:
    parts: list[str] = []
    for token in tokens:
        value = str(token.get("text") or "").strip()
        if not value:
            continue
        if not parts or _PUNCTUATION.match(value):
            parts.append(value)
        elif _CJK.search(parts[-1][-1:]) and _CJK.search(value[:1]):
            parts.append(value)
        else:
            parts.append(" " + value)
    return "".join(parts).strip()


def provider_word_transcript(diagnostics: list[dict]) -> dict | None:
    """Production complete provider timing into canonical transcript rows.

    Each provider session owns a separate audio clock. Session durations come
    from the PCM actually returned, so later sessions can be offset without
    guessing from the final word. Invalid or incomplete timing is ignored so
    the normal transcription workflow remains the honest fallback.
    """
    if not diagnostics:
        return None
    accepted = sorted(
        (item for item in diagnostics if item.get("status") == "accepted"),
        key=lambda item: int(item.get("session") or 0),
    )
    if len(accepted) != len(diagnostics):
        return None
    if [int(item.get("session") or 0) for item in accepted] != list(
            range(1, len(accepted) + 1)):
        return None

    offset = 0
    sentences: list[dict] = []
    for session in accepted:
        duration_value = session.get("audio_duration_ms")
        if not isinstance(duration_value, (int, float)) \
                or not math.isfinite(float(duration_value)):
            return None
        duration = round(float(duration_value))
        rows = session.get("word_timestamps")
        if duration <= 0 or not isinstance(rows, list) or not rows:
            return None

        grouped: dict[int, list[dict]] = {}
        previous_begin = -1
        for row in rows:
            if not isinstance(row, dict):
                return None
            text = str(row.get("text") or "").strip()
            begin_value, end_value = row.get("begin_time"), row.get("end_time")
            if not text or not isinstance(begin_value, (int, float)) \
                    or not isinstance(end_value, (int, float)) \
                    or not math.isfinite(float(begin_value)) \
                    or not math.isfinite(float(end_value)):
                return None
            begin, end = round(float(begin_value)), round(float(end_value))
            if begin < 0 or end <= begin or begin < previous_begin:
                return None
            if end > duration + 250:
                return None
            previous_begin = begin
            sentence_index = row.get("sentence_index", 0)
            if not isinstance(sentence_index, int) or sentence_index < 0:
                return None
            grouped.setdefault(sentence_index, []).append({
                "start": offset + begin,
                "end": offset + end,
                "text": text,
            })

        for words in sorted(grouped.values(), key=lambda value: value[0]["start"]):
            sentences.append({
                "start": words[0]["start"],
                "end": words[-1]["end"],
                "text": _join(words),
                "words": words,
            })
        offset += duration

    if not sentences:
        return None
    return {
        "text": " ".join(item["text"] for item in sentences),
        "sentences": sentences,
        "audio_duration_ms": offset,
    }


def _wrap(text: str, width: int, max_lines: int) -> str:
    text = " ".join(text.split())
    if len(text) <= width:
        return text
    if " " not in text:
        return "\n".join(text[index:index + width]
                         for index in range(0, len(text), width))

    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    if len(lines) <= max_lines:
        return "\n".join(lines)

    # Constraints should normally split before wrapping.  Rebalance safely if
    # a single unusually long token still overflows the requested line count.
    joined = " ".join(lines)
    target = max(1, len(joined) // max_lines)
    balanced: list[str] = []
    remainder = joined
    while len(balanced) < max_lines - 1 and len(remainder) > target:
        split = remainder.rfind(" ", 0, target + 1)
        if split <= 0:
            split = target
        balanced.append(remainder[:split].strip())
        remainder = remainder[split:].strip()
    balanced.append(remainder)
    return "\n".join(balanced)


def _estimated_words(sentence: dict) -> list[dict]:
    """Allocate sentence time by token length when word timings are absent."""
    text = str(sentence.get("text") or "").strip()
    if not text:
        return []
    values = text.split() or list(text)
    start = int(sentence.get("start") or 0)
    end = max(start + 1, int(sentence.get("end") or start + 1))
    weights = [max(1, len(value)) for value in values]
    total = sum(weights)
    cursor = start
    output: list[dict] = []
    consumed = 0
    for index, (value, weight) in enumerate(zip(values, weights)):
        consumed += weight
        finish = end if index == len(values) - 1 else start + round((end - start) * consumed / total)
        output.append({"start": cursor, "end": max(cursor + 1, finish), "text": value})
        cursor = output[-1]["end"]
    return output


def _sentence_words(sentence: dict) -> tuple[list[dict], bool]:
    words = [
        {
            "start": int(word.get("start") or 0),
            "end": int(word.get("end") or word.get("start") or 0),
            "text": str(word.get("text") or "").strip(),
        }
        for word in (sentence.get("words") or [])
        if str(word.get("text") or "").strip()
    ]
    if words:
        aligned = True
        sentence_end = int(sentence.get("end") or 0)
        for index, word in enumerate(words):
            if word["end"] > word["start"]:
                continue
            aligned = False
            previous_end = words[index - 1]["end"] if index else word["start"]
            following = words[index + 1] if index + 1 < len(words) else None
            if previous_end < word["start"]:
                # Some provider payloads put a zero-duration connective at the
                # end of the preceding natural gap. Use that gap first.
                word["end"] = word["start"]
                word["start"] = previous_end
            elif following and following["start"] == word["start"] and following["end"] > word["start"]:
                # Otherwise split a small, explicit slice from the following
                # token instead of exporting a one-millisecond subtitle.
                available = following["end"] - word["start"]
                share = min(200, max(80, available // 4))
                word["end"] = min(following["end"] - 1, word["start"] + share)
                following["start"] = word["end"]
            else:
                next_start = following["start"] if following else sentence_end
                word["end"] = next_start if next_start > word["start"] else word["start"] + 1
        return words, aligned
    return _estimated_words(sentence), False


def _flush(tokens: list[dict], settings: CaptionProfile, aligned: bool) -> dict:
    text = _join(tokens)
    return {
        "start": int(tokens[0]["start"]),
        "end": max(int(tokens[0]["start"]) + 1, int(tokens[-1]["end"])),
        "text": _wrap(text, settings.line_chars, settings.max_lines),
        "words": [dict(token) for token in tokens],
        "timing": "word" if aligned else "estimated",
    }


def build_cues(source: dict | list[dict], profile_key: str = "standard") -> list[dict]:
    settings = profile(profile_key)
    sentences = source.get("sentences", []) if isinstance(source, dict) else source
    cues: list[dict] = []
    for sentence in sentences:
        words, aligned = _sentence_words(sentence)
        if not words:
            continue
        chunk: list[dict] = []
        for word in words:
            candidate = chunk + [word]
            candidate_text = _join(candidate)
            duration = int(candidate[-1]["end"]) - int(candidate[0]["start"])
            over = bool(chunk) and (
                len(candidate) > settings.max_words
                or len(candidate_text) > settings.max_chars
                or duration > settings.max_duration_ms
            )
            if over:
                cues.append(_flush(chunk, settings, aligned))
                chunk = [word]
            else:
                chunk = candidate

            # Compact captions feel natural when punctuation closes a thought;
            # do not force a full five-word block across that boundary.
            if (profile_key == "short" and len(chunk) >= 2
                    and _BREAK.search(str(chunk[-1].get("text") or ""))):
                cues.append(_flush(chunk, settings, aligned))
                chunk = []
        if chunk:
            cues.append(_flush(chunk, settings, aligned))

    # Improve readability without creating overlaps. Exact word boundaries are
    # retained in cue.words even when a very short visual cue is extended.
    for index, cue in enumerate(cues):
        wanted = cue["start"] + settings.min_duration_ms
        ceiling = cues[index + 1]["start"] if index + 1 < len(cues) else wanted
        cue["end"] = max(cue["end"], min(wanted, ceiling))
    return cues


def _timestamp(milliseconds: int, comma: bool = True) -> str:
    hours, milliseconds = divmod(max(milliseconds, 0), 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    separator = "," if comma else "."
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{separator}{milliseconds:03d}"


def render_srt(cues: list[dict]) -> str:
    lines: list[str] = []
    for index, cue in enumerate(cues, 1):
        lines.extend([
            str(index),
            f"{_timestamp(cue['start'])} --> {_timestamp(cue['end'])}",
            cue["text"],
            "",
        ])
    return "\n".join(lines)


def render_vtt(cues: list[dict]) -> str:
    lines = ["WEBVTT", ""]
    for cue in cues:
        lines.extend([
            f"{_timestamp(cue['start'], False)} --> {_timestamp(cue['end'], False)}",
            cue["text"],
            "",
        ])
    return "\n".join(lines)


def layout(source: dict | list[dict], profile_key: str = "standard") -> dict:
    settings = profile(profile_key)
    cues = build_cues(source, profile_key)
    words_per_cue = [len(cue.get("words") or []) for cue in cues]
    cps_values = [
        len(cue["text"].replace("\n", " ")) / max((cue["end"] - cue["start"]) / 1000, .001)
        for cue in cues
    ]
    quality = "word_aligned" if cues and all(cue["timing"] == "word" for cue in cues) else "estimated"
    timing_payload = [{"start": cue["start"], "end": cue["end"], "text": cue["text"].replace("\n", " ")} for cue in cues]
    return {
        "profile": asdict(settings),
        "cues": cues,
        "srt": render_srt(cues),
        "vtt": render_vtt(cues),
        "timing_json": json.dumps(timing_payload, ensure_ascii=False, indent=2),
        "timing_quality": quality,
        "metrics": {
            "cues": len(cues),
            "average_words": round(sum(words_per_cue) / len(words_per_cue), 1) if words_per_cue else 0,
            "maximum_cps": round(max(cps_values), 1) if cps_values else 0,
        },
    }
