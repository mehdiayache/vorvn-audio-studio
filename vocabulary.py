#!/usr/bin/env python3
"""
Custom vocabulary — words the recogniser keeps getting wrong.

Brand names, people's names and jargon get mangled by speech recognition
("Bali" heard as "bell"). A vocabulary list tells the recogniser these words
exist, so it stops guessing at something more common.

Lists live on Alibaba's side and are referenced by id when transcribing.
"""

import re

MODEL = "fun-asr"          # must match the model used for transcription
MAX_WORDS = 500
MIN_WEIGHT, MAX_WEIGHT, DEFAULT_WEIGHT = 1, 5, 4

# fun-asr accepts a narrower set of languages than the recogniser itself.
LANGUAGES = {"en": "English", "zh": "Chinese", "ja": "Japanese"}


def _service():
    from dashscope.audio.asr import VocabularyService
    return VocabularyService()


def check_word(text: str) -> str | None:
    """Return why a word would be rejected, or None if it's fine.

    The limits are the service's, but hitting them mid-save loses the whole
    list — so each entry is checked before anything is sent.
    """
    text = (text or "").strip()
    if not text:
        return "Empty."
    if text.isascii():
        if len(text.split()) > 7:
            return "Too many words — 7 at most for English."
    elif len(text) > 15:
        return "Too long — 15 characters at most for non-Latin text."
    return None


def clean(entries: list) -> tuple[list, list]:
    """Split submitted entries into valid ones and rejected ones with reasons."""
    good, bad = [], []
    seen = set()
    for entry in entries:
        text = (entry.get("text") or "").strip()
        problem = check_word(text)
        if problem:
            bad.append({"text": text, "reason": problem})
            continue
        if text.lower() in seen:
            bad.append({"text": text, "reason": "Already in the list."})
            continue
        seen.add(text.lower())
        weight = entry.get("weight", DEFAULT_WEIGHT)
        try:
            weight = max(MIN_WEIGHT, min(MAX_WEIGHT, int(weight)))
        except (TypeError, ValueError):
            weight = DEFAULT_WEIGHT
        item = {"text": text, "weight": weight}
        language = entry.get("lang")
        if language in LANGUAGES:
            item["lang"] = language
        good.append(item)

    if len(good) > MAX_WORDS:
        for extra in good[MAX_WORDS:]:
            bad.append({"text": extra["text"],
                        "reason": f"Over the {MAX_WORDS}-word limit."})
        good = good[:MAX_WORDS]
    return good, bad


def valid_prefix(prefix: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9]{1,10}", prefix or ""))


def create(prefix: str, words: list) -> str:
    return _service().create_vocabulary(
        target_model=MODEL, prefix=prefix, vocabulary=words)


def update(vocabulary_id: str, words: list) -> None:
    _service().update_vocabulary(vocabulary_id=vocabulary_id, vocabulary=words)


def delete(vocabulary_id: str) -> None:
    _service().delete_vocabulary(vocabulary_id=vocabulary_id)


def get(vocabulary_id: str) -> list:
    """The words in one list, normalised to plain dicts."""
    result = _service().query_vocabulary(vocabulary_id=vocabulary_id)
    words = result.get("vocabulary") if isinstance(result, dict) else result
    return [
        {"text": w.get("text", ""), "weight": w.get("weight", DEFAULT_WEIGHT),
         "lang": w.get("lang")}
        for w in (words or []) if isinstance(w, dict)
    ]


def listing() -> list:
    """Every vocabulary on the account, newest first."""
    found = _service().list_vocabularies(page_size=100) or []
    rows = []
    for item in found:
        if not isinstance(item, dict):
            rows.append({"id": str(item), "name": str(item)})
            continue
        vocabulary_id = item.get("vocabulary_id") or item.get("id") or ""
        rows.append({
            "id": vocabulary_id,
            # Strip the model prefix and trailing hash so the list is readable.
            "name": re.sub(r"^vocab-", "", vocabulary_id).rsplit("-", 1)[0] or vocabulary_id,
            "created": item.get("gmt_create") or item.get("create_time") or "",
            "status": item.get("status") or "",
        })
    return rows
