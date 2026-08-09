"""Production timeline commands, isolated from HTTP and provider execution."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from audio_studio.infrastructure.postgres import work as repository

from audio_studio.application.preferences import load_preferences
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)


asset_repository = VentureAssetRepository()
document_repository = ProductionDocumentRepository()


class TranscriptState(Protocol):
    def mark_stale(self, generation_id: int) -> int: ...
    def list_for_generation(self, generation_id: int) -> list[dict]: ...


class TimelineError(ValueError):
    pass


def legacy_id(production_id: int) -> int:
    production = repository.production_get(production_id)
    if not production:
        raise TimelineError("That Production does not exist.")
    return int(production["legacy_container_id"])


def _part(part_id: int, production_id: int | None = None) -> dict[str, Any]:
    part = (document_repository.part(production_id, part_id)
            if production_id is not None else None)
    if not part:
        raise TimelineError("That Part does not exist.")
    return part


def music(production_id: int) -> dict[str, Any]:
    legacy_id(production_id)
    return document_repository.music(production_id)


def set_music(production_id: int, values: dict[str, Any]) -> dict[str, Any]:
    legacy_id(production_id)
    music_of = values.get("music_of")
    if (music_of not in (None, "", 0, "0")
            and not asset_repository.allowed_for_production(
                production_id, int(music_of), {"music"})):
        raise TimelineError("Background music must come from this Venture's Music library.")
    if not document_repository.set_music(production_id, values):
        raise TimelineError("Those music settings could not be saved.")
    return document_repository.music(production_id)


def reorder(production_id: int, order: list[int]) -> bool:
    legacy_id(production_id)
    return document_repository.reorder(production_id, [int(item) for item in order])


def add_silence(production_id: int, seconds: float, insert_at: int | None) -> dict[str, Any]:
    legacy_id(production_id)
    seconds = max(0.1, min(120.0, float(seconds)))
    new_id = document_repository.create_part(production_id, {
        "text": f"{seconds:g} seconds of silence", "voice": "-", "engine": "system",
        "model": "-", "format": "mp3", "language": None, "instruction": None,
        "speech_mode": "silence", "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
        "filename": "", "path": "", "size_bytes": 0,
        "duration_ms": round(seconds * 1000), "chars": 0, "requests": 0, "cost": 0,
        "kind": "silence",
        "title": f"{seconds:g}", "usage": {}, "cost_basis": "not billed", "failures": [],
    }, insert_at=insert_at)
    if not new_id:
        raise TimelineError("The silence could not be saved.")
    return {"id": new_id, "seconds": seconds}


def add_draft(production_id: int, values: dict[str, Any]) -> dict[str, Any]:
    legacy_id(production_id)
    text = str(values.get("text") or "").strip()
    if not text:
        raise TimelineError("Write something before saving a Draft.")
    insert_at = values.get("insert_at")
    new_id = document_repository.create_part(production_id, {
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
        "kind": "draft",
        "usage": {}, "cost_basis": "not billed", "failures": [],
    }, insert_at=insert_at)
    if not new_id:
        raise TimelineError("The Draft could not be saved.")
    return {"id": new_id}


def edit_silence(production_id: int, part_id: int, seconds: float) -> dict[str, Any]:
    part = _part(part_id, production_id)
    if part.get("kind") != "silence":
        raise TimelineError("That Part is not silence.")
    seconds = max(0.1, min(120.0, float(seconds)))
    if not document_repository.update_part(
            production_id, part_id, {"title": f"{seconds:g}",
                                     "text": f"{seconds:g} seconds of silence",
                                     "duration_ms": round(seconds * 1000)}):
        raise TimelineError("The silence could not be updated.")
    return {"id": part_id, "seconds": seconds}


def insert_asset(production_id: int, asset_id: int, insert_at: int | None) -> dict[str, Any]:
    legacy_id(production_id)
    asset = asset_repository.get(asset_id)
    if not asset or not asset.get("filename"):
        raise TimelineError("That Asset does not exist.")
    context = asset_repository.library_context(asset_id)
    if context and context.get("collection") == "Music":
        raise TimelineError("Music is a background bed. Choose it in the Music controls.")
    if not asset_repository.allowed_for_production(
            production_id, asset_id, {"intros", "outros", "stingers"}):
        raise TimelineError("That clip is not in this Venture's reusable clip library.")
    part_id = document_repository.insert_asset(production_id, asset_id, insert_at)
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
    new_id = document_repository.duplicate(production_id, part_id, copied)
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
    # The repository first materialises any pre-ledger cost, so historical
    # spend remains correct even though the current sequence changes.
    # Keep detached files recoverable. A separate retention policy may tidy
    # them later; deleting a card is not permission to erase paid media now.
    if document_repository.delete(production_id, selected) is None:
        raise TimelineError("Those Parts could not be deleted.")
    return {"deleted": len(selected)}


def move_parts(source_production_id: int, ids: list[int], destination_production_id: int) -> dict[str, Any]:
    selected = [int(item) for item in ids]
    if not selected:
        raise TimelineError("Choose at least one Part.")
    for part_id in selected:
        _part(part_id, source_production_id)
    legacy_id(destination_production_id)
    if not document_repository.move(
            source_production_id, selected, destination_production_id):
        raise TimelineError("Those Parts could not be moved.")
    return {"moved": len(selected)}


def takes(production_id: int, part_id: int) -> list[dict[str, Any]]:
    _part(part_id, production_id)
    return document_repository.takes(production_id, part_id) or []


def promote(production_id: int, part_id: int, take_id: int,
            transcripts: TranscriptState) -> dict[str, Any]:
    _part(part_id, production_id)
    if not document_repository.promote(production_id, part_id, take_id):
        raise TimelineError("That Take no longer belongs to this Part.")
    return {"ok": True, "subtitles_stale": transcripts.mark_stale(part_id)}


def save_text(production_id: int, part_id: int, values: dict[str, Any]) -> dict[str, Any]:
    _part(part_id, production_id)
    if not document_repository.save_text(production_id, part_id, values):
        raise TimelineError("The text states could not be saved.")
    return {"ok": True}


def captions(production_id: int, part_id: int,
             transcripts: TranscriptState) -> list[dict[str, Any]]:
    _part(part_id, production_id)
    return transcripts.list_for_generation(part_id)
