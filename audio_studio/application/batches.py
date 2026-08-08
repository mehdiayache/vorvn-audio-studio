"""Spreadsheet intake for durable Batch jobs; parsing never spends provider money."""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4

import batch
import db
import say

from audio_studio.config import settings


def _known_voice_ids() -> set[str]:
    known = {str(voice_id) for tier in say.VOICES.values() for voice_id in tier}
    known.update(str(item.get("voice_id") or "") for item in db.voice_custom_bindings())
    return {voice for voice in known if voice}


def _voice_check(sheet: dict, column: int | None) -> dict:
    if column is None:
        return {"unknown": [], "checked": 0}
    known = _known_voice_ids()
    seen: set[str] = set()
    unknown: dict[str, int] = {}
    for index, row in enumerate(sheet["rows"], 1):
        value = batch.cell(row, column)
        if not value or value in seen:
            continue
        seen.add(value)
        if value not in known:
            unknown[value] = index
    return {
        "unknown": [{"voice": voice, "first_row": row}
                    for voice, row in unknown.items()],
        "checked": len(seen),
    }


def preview(raw: bytes, filename: str) -> dict:
    if not raw:
        raise ValueError("Choose a spreadsheet first.")
    if len(raw) > 25_000_000:
        raise ValueError("That spreadsheet is over 25 MB.")
    safe_name = Path(unquote(filename)).name or "sheet.csv"
    sheet = batch.read(safe_name, raw)
    root = settings.root / ".batches"
    root.mkdir(exist_ok=True)
    token = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid4().hex[:8]}"
    (root / f"{token}.json").write_text(json.dumps(sheet), encoding="utf-8")
    guess = batch.guess_columns(sheet["headers"])
    return {
        "token": token, "name": safe_name, "headers": sheet["headers"],
        "rows": len(sheet["rows"]), "preview": sheet["rows"][:8],
        "guess": guess, "voices": _voice_check(sheet, guess.get("voice")),
        "truncated": sheet["truncated"], "max_rows": batch.MAX_ROWS,
    }
