"""Production timeline commands, isolated from HTTP and provider execution."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

import db
from domain import repository

from audio_studio.application.preferences import load_preferences


class TimelineError(ValueError):
    pass


def legacy_id(production_id: int) -> int:
    production = repository.production_get(production_id)
    if not production:
        raise TimelineError("That Production does not exist.")
    return int(production["legacy_container_id"])


def _part(part_id: int, production_id: int | None = None) -> dict[str, Any]:
    part = db.get(part_id)
    if not part:
        raise TimelineError("That Part does not exist.")
    if production_id is not None and int(part.get("project_id") or 0) != legacy_id(production_id):
        raise TimelineError("That Part does not belong to this Production.")
    return part


def music(production_id: int) -> dict[str, Any]:
    return db.music_get(legacy_id(production_id))


def set_music(production_id: int, values: dict[str, Any]) -> dict[str, Any]:
    target = legacy_id(production_id)
    music_of = values.get("music_of")
    if music_of not in (None, "", 0, "0") and not db.asset_allowed(target, int(music_of), {"Music"}):
        raise TimelineError("Background music must come from this Venture's Music library.")
    if not db.music_set(target, values):
        raise TimelineError("Those music settings could not be saved.")
    return db.music_get(target)


def reorder(production_id: int, order: list[int]) -> bool:
    return db.parts_reorder(legacy_id(production_id), [int(item) for item in order])


def add_silence(production_id: int, seconds: float, insert_at: int | None) -> dict[str, Any]:
    target = legacy_id(production_id)
    seconds = max(0.1, min(120.0, float(seconds)))
    position = int(insert_at) if insert_at is not None else db.next_position(target)
    new_id = db.record({
        "text": f"{seconds:g} seconds of silence", "voice": "-", "engine": "system",
        "model": "-", "format": "mp3", "language": None, "instruction": None,
        "speech_mode": "silence", "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
        "filename": "", "path": "", "size_bytes": 0,
        "duration_ms": round(seconds * 1000), "chars": 0, "requests": 0, "cost": 0,
        "project_id": target, "position": position, "kind": "silence",
        "title": f"{seconds:g}", "usage": {}, "cost_basis": "not billed", "failures": [],
    }, insert_at=position if insert_at is not None else None)
    if not new_id:
        raise TimelineError("The silence could not be saved.")
    return {"id": new_id, "seconds": seconds}


def add_draft(production_id: int, values: dict[str, Any]) -> dict[str, Any]:
    target = legacy_id(production_id)
    text = str(values.get("text") or "").strip()
    if not text:
        raise TimelineError("Write something before saving a Draft.")
    insert_at = values.get("insert_at")
    position = int(insert_at) if insert_at is not None else db.next_position(target)
    new_id = db.record({
        "text": text,
        "text_raw": values.get("text_raw"),
        "text_shaped": values.get("text_shaped"),
        "text_tagged": values.get("text_tagged"),
        "text_state": values.get("text_state") or "raw",
        "voice": values.get("voice") or "-",
        "voice_identity_id": values.get("voice_identity_id"),
        "engine": values.get("engine") or "audio",
        "model": values.get("model") or "plus",
        "format": values.get("format") or "mp3",
        "language": values.get("language") or "Auto",
        "instruction": values.get("instruction") or "",
        "speech_mode": values.get("speech_mode") or "exact",
        "rate": values.get("rate", 1), "pitch": values.get("pitch", 1),
        "volume": values.get("volume", 50), "seed": values.get("seed", 0),
        "filename": "", "path": "", "size_bytes": 0, "duration_ms": 0,
        "chars": len(text), "requests": 0, "cost": 0,
        "project_id": target, "position": position, "kind": "draft",
        "usage": {}, "cost_basis": "not billed", "failures": [],
    }, insert_at=position if insert_at is not None else None)
    if not new_id:
        raise TimelineError("The Draft could not be saved.")
    return {"id": new_id}


def edit_silence(production_id: int, part_id: int, seconds: float) -> dict[str, Any]:
    part = _part(part_id, production_id)
    if part.get("kind") != "silence":
        raise TimelineError("That Part is not silence.")
    seconds = max(0.1, min(120.0, float(seconds)))
    if not db.replace_take(part_id, {"title": f"{seconds:g}",
                                     "text": f"{seconds:g} seconds of silence",
                                     "duration_ms": round(seconds * 1000)}):
        raise TimelineError("The silence could not be updated.")
    return {"id": part_id, "seconds": seconds}


def insert_asset(production_id: int, asset_id: int, insert_at: int | None) -> dict[str, Any]:
    target = legacy_id(production_id)
    asset = db.asset_get(asset_id)
    if not asset or not asset.get("filename"):
        raise TimelineError("That Asset does not exist.")
    context = db.asset_library_context(asset_id)
    if context and context.get("collection") == "Music":
        raise TimelineError("Music is a background bed. Choose it in the Music controls.")
    if not db.asset_allowed(target, asset_id, {"Intros", "Outros", "Stingers"}):
        raise TimelineError("That clip is not in this Venture's reusable clip library.")
    part_id = db.asset_insert(target, asset_id, insert_at)
    if not part_id:
        raise TimelineError("The Asset could not be inserted.")
    return {"id": part_id}


def duplicate(production_id: int, part_id: int) -> dict[str, Any]:
    part = _part(part_id, production_id)
    copied = ""
    if part.get("filename"):
        output = Path(load_preferences()["out_dir"]).expanduser().resolve()
        source = (output / Path(part["filename"]).name).resolve()
        if output in source.parents and source.is_file():
            copied = f"{source.stem}-copy-{uuid4().hex[:10]}{source.suffix}"
            (output / copied).write_bytes(source.read_bytes())
    new_id = db.part_duplicate(part_id, copied)
    if not new_id:
        if copied:
            (Path(load_preferences()["out_dir"]) / copied).unlink(missing_ok=True)
        raise TimelineError("That Part could not be duplicated.")
    return {"id": new_id, "filename": copied or None}


def delete_parts(production_id: int, ids: list[int]) -> dict[str, Any]:
    selected = [int(item) for item in ids]
    if not selected:
        raise TimelineError("Choose at least one Part.")
    for part_id in selected:
        _part(part_id, production_id)
    # db.parts_delete first materialises any pre-ledger cost, so historical
    # spend remains correct even though the current sequence changes.
    # Keep detached files recoverable. A separate retention policy may tidy
    # them later; deleting a card is not permission to erase paid media now.
    db.parts_delete(selected)
    return {"deleted": len(selected)}


def move_parts(source_production_id: int, ids: list[int], destination_production_id: int) -> dict[str, Any]:
    selected = [int(item) for item in ids]
    if not selected:
        raise TimelineError("Choose at least one Part.")
    for part_id in selected:
        _part(part_id, source_production_id)
    if not db.parts_move(selected, legacy_id(destination_production_id)):
        raise TimelineError("Those Parts could not be moved.")
    return {"moved": len(selected)}


def takes(production_id: int, part_id: int) -> list[dict[str, Any]]:
    _part(part_id, production_id)
    return db.takes(part_id)


def promote(production_id: int, part_id: int, take_id: int) -> dict[str, Any]:
    _part(part_id, production_id)
    if db.take_part_id(take_id) != part_id or not db.promote_take(take_id):
        raise TimelineError("That Take no longer belongs to this Part.")
    return {"ok": True, "subtitles_stale": db.mark_transcripts_stale(part_id)}


def save_text(production_id: int, part_id: int, values: dict[str, Any]) -> dict[str, Any]:
    _part(part_id, production_id)
    if not db.text_states(part_id, values):
        raise TimelineError("The text states could not be saved.")
    return {"ok": True}


def captions(production_id: int, part_id: int) -> list[dict[str, Any]]:
    _part(part_id, production_id)
    return db.transcripts_for(part_id)
