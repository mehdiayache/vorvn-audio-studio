"""CSV, TSV and Excel decoding for Batch intake."""

from __future__ import annotations

import csv
import io

from audio_studio.domain.batch import MAX_ROWS, SUPPORTED


def read(filename: str, data: bytes) -> dict:
    """Return normalized headers and rows from a supported spreadsheet."""
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        rows = _from_excel(data)
    elif name.endswith((".csv", ".tsv")):
        rows = _from_delimited(data, "\t" if name.endswith(".tsv") else None)
    else:
        raise ValueError(f"Can't read '{filename}'. Use {', '.join(SUPPORTED)}.")

    rows = [row for row in rows if any((cell or "").strip() for cell in row)]
    if not rows:
        raise ValueError("That file has no rows in it.")
    headers = [(cell or "").strip() or f"Column {index + 1}"
               for index, cell in enumerate(rows[0])]
    body = rows[1:]
    return {
        "headers": headers,
        "rows": body[:MAX_ROWS],
        "truncated": len(body) > MAX_ROWS,
    }


def _from_excel(data: bytes) -> list[list[str]]:
    import openpyxl

    sheet = openpyxl.load_workbook(io.BytesIO(data), data_only=True).active
    return [["" if cell is None else str(cell) for cell in row]
            for row in sheet.iter_rows(values_only=True)]


def _from_delimited(data: bytes, delimiter: str | None = None) -> list[list[str]]:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("utf-8", errors="replace")
    if delimiter is None:
        try:
            delimiter = csv.Sniffer().sniff(
                text[:4000], delimiters=",;\t|").delimiter
        except csv.Error:
            delimiter = ","
    return list(csv.reader(io.StringIO(text), delimiter=delimiter))
