"""Pure Batch spreadsheet limits and column-selection policy."""

import re

SUPPORTED = (".csv", ".tsv", ".xlsx", ".xlsm")
MAX_ROWS = 2000

# Column names worth pre-selecting, in the order we'd prefer them.
LIKELY_TEXT = ("text", "script", "line", "sentence", "content", "message",
               "phrase", "words", "body", "description")
LIKELY_NAME = ("name", "filename", "file", "id", "key", "slug", "title", "sku")
LIKELY_VOICE = ("voice", "speaker", "talent")
LIKELY_LANGUAGE = ("language", "lang", "locale")


def guess_columns(headers: list) -> dict:
    """Pre-select the columns a person most likely meant."""
    lowered = [h.strip().lower() for h in headers]

    def find(candidates):
        for candidate in candidates:
            for index, header in enumerate(lowered):
                if header == candidate:
                    return index
        for candidate in candidates:
            for index, header in enumerate(lowered):
                if candidate in header:
                    return index
        return None

    text = find(LIKELY_TEXT)
    if text is None:
        # Fall back to whichever column holds the most prose.
        text = 0
    return {"text": text, "name": find(LIKELY_NAME),
            "voice": find(LIKELY_VOICE), "language": find(LIKELY_LANGUAGE)}


def cell(row: list, index) -> str:
    if index is None or index < 0 or index >= len(row):
        return ""
    return (row[index] or "").strip()


def safe_name(value: str, fallback: str) -> str:
    """A filename that won't collide, escape its folder, or upset the OS."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-.")
    return (cleaned[:60] or fallback)

