"""Production timeline use cases."""

from __future__ import annotations

from typing import Any, Protocol


class TimelineRecords(Protocol):
    def production(self, production_id: int) -> dict | None: ...
    def part(self, production_id: int, part_id: int) -> dict | None: ...
    def music(self, production_id: int) -> dict: ...
    def set_music(self, production_id: int, values: dict) -> bool: ...
    def reorder(self, production_id: int, order: list[int]) -> bool: ...
    def create_part(
        self, production_id: int, values: dict,
        insert_at: int | None = None,
    ) -> int | None: ...
    def asset(self, asset_id: int) -> dict | None: ...
    def asset_context(self, asset_id: int) -> dict | None: ...
    def asset_allowed(
        self, production_id: int, asset_id: int, kinds: set[str],
    ) -> bool: ...
    def insert_asset(
        self, production_id: int, asset_id: int, insert_at: int | None,
    ) -> int | None: ...
    def duplicate(
        self, production_id: int, part_id: int, filename: str,
    ) -> int | None: ...
    def delete(self, production_id: int, ids: list[int]) -> list[str] | None: ...
    def move(
        self, source_production_id: int, ids: list[int],
        destination_production_id: int,
    ) -> bool: ...
    def takes(self, production_id: int, part_id: int) -> list[dict] | None: ...
    def promote(self, production_id: int, part_id: int, take_id: int) -> bool: ...
    def save_text(self, production_id: int, part_id: int, values: dict) -> bool: ...


class TimelineWorkspace(Protocol):
    def duplicate(self, filename: str) -> str: ...
    def discard(self, filename: str) -> None: ...


class TranscriptState(Protocol):
    def mark_stale(self, generation_id: int) -> int: ...
    def list_for_generation(self, generation_id: int) -> list[dict]: ...


class TimelineError(ValueError):
    pass


class TimelineService:
    def __init__(
        self, records: TimelineRecords, workspace: TimelineWorkspace,
        transcripts: TranscriptState,
    ):
        self.records = records
        self.workspace = workspace
        self.transcripts = transcripts

    def _production(self, production_id: int) -> dict:
        production = self.records.production(production_id)
        if not production:
            raise TimelineError("That Production does not exist.")
        return production

    def _part(self, production_id: int, part_id: int) -> dict[str, Any]:
        part = self.records.part(production_id, part_id)
        if not part:
            raise TimelineError("That Part does not exist.")
        return part

    def music(self, production_id: int) -> dict[str, Any]:
        self._production(production_id)
        return self.records.music(production_id)

    def set_music(
        self, production_id: int, values: dict[str, Any],
    ) -> dict[str, Any]:
        self._production(production_id)
        music_of = values.get("music_of")
        if (music_of not in (None, "", 0, "0")
                and not self.records.asset_allowed(
                    production_id, int(music_of), {"music"})):
            raise TimelineError(
                "Background music must come from this Venture's Music library.")
        if not self.records.set_music(production_id, values):
            raise TimelineError("Those music settings could not be saved.")
        return self.records.music(production_id)

    def reorder(self, production_id: int, order: list[int]) -> bool:
        self._production(production_id)
        return self.records.reorder(
            production_id, [int(item) for item in order])

    def add_silence(
        self, production_id: int, seconds: float, insert_at: int | None,
    ) -> dict[str, Any]:
        self._production(production_id)
        seconds = max(0.1, min(120.0, float(seconds)))
        new_id = self.records.create_part(production_id, {
            "text": f"{seconds:g} seconds of silence", "voice": "-",
            "engine": "system", "model": "-", "format": "mp3",
            "language": None, "instruction": None, "speech_mode": "silence",
            "rate": 1, "pitch": 1, "volume": 50, "seed": 0,
            "filename": "", "path": "", "size_bytes": 0,
            "duration_ms": round(seconds * 1000), "chars": 0, "requests": 0,
            "cost": 0, "kind": "silence", "title": f"{seconds:g}",
            "usage": {}, "cost_basis": "not billed", "failures": [],
        }, insert_at=insert_at)
        if not new_id:
            raise TimelineError("The silence could not be saved.")
        return {"id": new_id, "seconds": seconds}

    def add_draft(
        self, production_id: int, values: dict[str, Any],
    ) -> dict[str, Any]:
        self._production(production_id)
        text = str(values.get("text") or "").strip()
        if not text:
            raise TimelineError("Write something before saving a Draft.")
        new_id = self.records.create_part(production_id, {
            "text": text, "text_raw": values.get("text_raw"),
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
            "chars": len(text), "requests": 0, "cost": 0, "kind": "draft",
            "usage": {}, "cost_basis": "not billed", "failures": [],
        }, insert_at=values.get("insert_at"))
        if not new_id:
            raise TimelineError("The Draft could not be saved.")
        return {"id": new_id}

    def edit_silence(
        self, production_id: int, part_id: int, seconds: float,
    ) -> dict[str, Any]:
        part = self._part(production_id, part_id)
        if part.get("kind") != "silence":
            raise TimelineError("That Part is not silence.")
        seconds = max(0.1, min(120.0, float(seconds)))
        if not self.records.save_text(production_id, part_id, {
                "title": f"{seconds:g}",
                "text": f"{seconds:g} seconds of silence",
                "duration_ms": round(seconds * 1000)}):
            raise TimelineError("The silence could not be updated.")
        return {"id": part_id, "seconds": seconds}

    def insert_asset(
        self, production_id: int, asset_id: int, insert_at: int | None,
    ) -> dict[str, Any]:
        self._production(production_id)
        asset = self.records.asset(asset_id)
        if not asset or not asset.get("filename"):
            raise TimelineError("That Asset does not exist.")
        context = self.records.asset_context(asset_id)
        if context and context.get("collection") == "Music":
            raise TimelineError(
                "Music is a background bed. Choose it in the Music controls.")
        if not self.records.asset_allowed(
                production_id, asset_id, {"intros", "outros", "stingers"}):
            raise TimelineError(
                "That clip is not in this Venture's reusable clip library.")
        part_id = self.records.insert_asset(production_id, asset_id, insert_at)
        if not part_id:
            raise TimelineError("The Asset could not be inserted.")
        return {"id": part_id}

    def duplicate(self, production_id: int, part_id: int) -> dict[str, Any]:
        part = self._part(production_id, part_id)
        copied = self.workspace.duplicate(part.get("filename") or "")
        new_id = self.records.duplicate(production_id, part_id, copied)
        if not new_id:
            if copied:
                self.workspace.discard(copied)
            raise TimelineError("That Part could not be duplicated.")
        return {"id": new_id, "filename": copied or None}

    def delete_parts(
        self, production_id: int, ids: list[int],
    ) -> dict[str, Any]:
        selected = [int(item) for item in ids]
        if not selected:
            raise TimelineError("Choose at least one Part.")
        for part_id in selected:
            self._part(production_id, part_id)
        # Persistence materializes any pre-ledger cost before deletion. Paid
        # media stays recoverable; removing a card is not permission to erase
        # its files or historical spend.
        if self.records.delete(production_id, selected) is None:
            raise TimelineError("Those Parts could not be deleted.")
        return {"deleted": len(selected)}

    def move_parts(
        self, source_production_id: int, ids: list[int],
        destination_production_id: int,
    ) -> dict[str, Any]:
        selected = [int(item) for item in ids]
        if not selected:
            raise TimelineError("Choose at least one Part.")
        for part_id in selected:
            self._part(source_production_id, part_id)
        self._production(destination_production_id)
        if not self.records.move(
                source_production_id, selected, destination_production_id):
            raise TimelineError("Those Parts could not be moved.")
        return {"moved": len(selected)}

    def takes(self, production_id: int, part_id: int) -> list[dict[str, Any]]:
        self._part(production_id, part_id)
        return self.records.takes(production_id, part_id) or []

    def promote(
        self, production_id: int, part_id: int, take_id: int,
    ) -> dict[str, Any]:
        self._part(production_id, part_id)
        if not self.records.promote(production_id, part_id, take_id):
            raise TimelineError("That Take no longer belongs to this Part.")
        return {"ok": True,
                "subtitles_stale": self.transcripts.mark_stale(part_id)}

    def save_text(
        self, production_id: int, part_id: int, values: dict[str, Any],
    ) -> dict[str, Any]:
        self._part(production_id, part_id)
        if not self.records.save_text(production_id, part_id, values):
            raise TimelineError("The text states could not be saved.")
        return {"ok": True}

    def captions(
        self, production_id: int, part_id: int,
    ) -> list[dict[str, Any]]:
        self._part(production_id, part_id)
        return self.transcripts.list_for_generation(part_id)
