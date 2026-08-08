#!/usr/bin/env python3
"""
Spreadsheet in, many audio files out.

Reads a CSV or Excel file and turns each row into its own recording. Columns are
mapped by the user rather than guessed at blindly, because a spreadsheet's first
column is as likely to be an id as the words to say.
"""

import csv
import io
import re
import zipfile
from pathlib import Path

SUPPORTED = (".csv", ".tsv", ".xlsx", ".xlsm")
MAX_ROWS = 2000

# Column names worth pre-selecting, in the order we'd prefer them.
LIKELY_TEXT = ("text", "script", "line", "sentence", "content", "message",
               "phrase", "words", "body", "description")
LIKELY_NAME = ("name", "filename", "file", "id", "key", "slug", "title", "sku")
LIKELY_VOICE = ("voice", "speaker", "talent")
LIKELY_LANGUAGE = ("language", "lang", "locale")


def read(filename: str, data: bytes) -> dict:
    """Return the header row and the data rows of a spreadsheet."""
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        rows = _from_excel(data)
    elif name.endswith((".csv", ".tsv")):
        rows = _from_delimited(data, "\t" if name.endswith(".tsv") else None)
    else:
        raise ValueError(f"Can't read '{filename}'. Use {', '.join(SUPPORTED)}.")

    rows = [r for r in rows if any((c or "").strip() for c in r)]
    if not rows:
        raise ValueError("That file has no rows in it.")

    headers = [(c or "").strip() or f"Column {i + 1}"
               for i, c in enumerate(rows[0])]
    body = rows[1:]
    if len(body) > MAX_ROWS:
        body = body[:MAX_ROWS]
    return {"headers": headers, "rows": body, "truncated": len(rows) - 1 > MAX_ROWS}


def _from_excel(data: bytes) -> list:
    import openpyxl
    sheet = openpyxl.load_workbook(io.BytesIO(data), data_only=True).active
    return [[("" if c is None else str(c)) for c in row]
            for row in sheet.iter_rows(values_only=True)]


def _from_delimited(data: bytes, delimiter=None) -> list:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("utf-8", errors="replace")

    if delimiter is None:
        # Sniffing beats assuming commas; European exports often use semicolons.
        sample = text[:4000]
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
        except csv.Error:
            delimiter = ","
    return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter)]


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


def make_zip(paths: list) -> bytes:
    """Bundle finished files so a 300-row job is one download, not 300."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in paths:
            target = Path(path)
            if target.exists():
                archive.write(target, arcname=target.name)
    return buffer.getvalue()
