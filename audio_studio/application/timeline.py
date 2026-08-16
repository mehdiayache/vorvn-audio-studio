"""Production timeline use cases."""

from __future__ import annotations

from typing import Any, Protocol


class TimelineRecords(Protocol):
    def production(self, production_id: int) -> dict | None: ...
    def part(self, production_id: int, part_id: int) -> dict | None: ...
    def music(self, production_id: int) -> dict: ...
    def set_music(self, production_id: int, values: dict) -> bool: ...
    def reorder(self, production_id: int, order: list[int]) -> bool: ...
    def set_enabled(
        self, production_id: int, part_id: int, enabled: bool,
    ) -> bool: ...
    def create_part(
        self, production_id: int, values: dict,
        before_part_public_id: str | None = None,
    ) -> int | None: ...
    def import_parts(
        self, production_id: int, items: list[dict],
        voice_identity_ids: set[str],
    ) -> dict[str, int] | None: ...
    def asset(self, asset_id: int) -> dict | None: ...
    def asset_context(self, asset_id: int) -> dict | None: ...
    def asset_allowed(
        self, production_id: int, asset_id: int, kinds: set[str],
    ) -> bool: ...
    def insert_asset(
        self, production_id: int, asset_id: int,
        before_part_public_id: str | None = None,
    ) -> int | None: ...
    def replace_asset(
        self, production_id: int, part_id: int, asset_id: int,
    ) -> bool: ...
    def duplicate(
        self, production_id: int, part_id: int, filename: str,
    ) -> int | None: ...
    def delete(self, production_id: int, ids: list[int]) -> list[str] | None: ...
    def move(
        self, source_production_id: int, ids: list[int],
        destination_production_id: int,
    ) -> bool: ...
    def save_script(self, production_id: int, part_id: int,
                    script: str, values: dict | None = None) -> bool: ...
    def save_editorial(self, production_id: int, part_id: int,
                       expected_revision: int, values: dict) -> dict | None: ...
    def save_draft(self, production_id: int, part_id: int,
                   values: dict) -> bool: ...


class TimelineWorkspace(Protocol):
    def duplicate(self, filename: str) -> str: ...
    def discard(self, filename: str) -> None: ...


class TranscriptState(Protocol):
    def mark_stale(self, part_id: int) -> int: ...
    def list_for_part(self, part_id: int) -> list[dict]: ...


class TimelineError(ValueError):
    pass


class TimelineConflict(TimelineError):
    def __init__(self, message: str, *, current_revision: int):
        super().__init__(message)
        self.current_revision = current_revision


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

    def set_enabled(
        self, production_id: int, part_id: int, enabled: bool,
    ) -> dict[str, Any]:
        self._part(production_id, part_id)
        if not self.records.set_enabled(
                production_id, part_id, bool(enabled)):
            raise TimelineError("The Part inclusion state could not be saved.")
        return {"ok": True, "enabled": bool(enabled)}

    def add_silence(
        self, production_id: int, seconds: float,
        before_part_public_id: str | None = None,
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
        }, before_part_public_id=before_part_public_id)
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
            "voice_identity_id": values.get("voice_identity_id"),
            "binding_id": values.get("binding_id"),
            "catalogue_voice_id": values.get("catalogue_voice_id"),
            "capability_id": values.get("capability_id"),
            "format": values.get("format") or "mp3",
            "language": values.get("language") or "Auto",
            "instruction": values.get("instruction") or "",
            "speech_mode": values.get("speech_mode") or "exact",
            "rate": values.get("rate", 1), "pitch": values.get("pitch", 1),
            "volume": values.get("volume", 50), "seed": values.get("seed", 0),
            "filename": "", "path": "", "size_bytes": 0, "duration_ms": 0,
            "chars": len(text), "requests": 0, "cost": 0, "kind": "draft",
            "usage": {}, "cost_basis": "not billed", "failures": [],
        }, before_part_public_id=values.get("insert_before_part_id"))
        if not new_id:
            raise TimelineError("The Draft could not be saved.")
        return {"id": new_id}

    def import_document(
        self, production_id: int, document: dict[str, Any],
        role_voices: dict[str, str],
    ) -> dict[str, int]:
        """Append validated V1 authoring items to the canonical Production."""
        self._production(production_id)
        items = list(document.get("items") or [])
        roles = {
            str(item["role"]): index
            for index, item in enumerate(items, start=1)
            if item.get("type") == "speech"
        }
        for role, item_number in roles.items():
            if role != role.strip():
                raise TimelineError(
                    f"Item {item_number}: role cannot start or end with spaces.")
        mapped_roles = set(role_voices)
        missing = sorted(set(roles) - mapped_roles)
        extra = sorted(mapped_roles - set(roles))
        if missing:
            raise TimelineError(
                "Map every role before importing. Missing: "
                + ", ".join(missing))
        if extra:
            raise TimelineError(
                "Remove role mappings that are not in this document: "
                + ", ".join(extra))
        for role, identity_id in role_voices.items():
            if not str(identity_id).strip():
                raise TimelineError(f"Choose a Voice for role {role}.")

        canonical_items: list[dict[str, Any]] = []
        for number, item in enumerate(items, start=1):
            if item["type"] == "silence":
                seconds = float(item["seconds"])
                canonical_items.append({
                    "kind": "silence",
                    "text": f"{seconds:g} seconds of silence",
                    "title": f"{seconds:g}",
                    "duration_ms": round(seconds * 1000),
                })
                continue
            text = str(item["text"])
            language = str(item["language"])
            instruction = str(item["instruction"])
            output_format = str(item["format"])
            for label, value in (
                ("text", text), ("language", language),
                ("format", output_format),
            ):
                if not value.strip():
                    raise TimelineError(
                        f"Item {number}: {label} cannot be blank.")
            canonical_items.append({
                "kind": "draft",
                "authored_role": str(item["role"]),
                "text": text,
                "text_raw": text,
                "text_shaped": None,
                "text_tagged": None,
                "text_state": "raw",
                "voice_identity_id": role_voices[str(item["role"])],
                "binding_id": None,
                "catalogue_voice_id": None,
                "capability_id": None,
                "language": language,
                "speech_mode": item["speech_mode"],
                "instruction": instruction,
                "rate": float(item["rate"]),
                "pitch": float(item["pitch"]),
                "volume": int(item["volume"]),
                "seed": int(item["seed"]),
                "format": output_format,
                "duration_ms": 0,
            })
        try:
            result = self.records.import_parts(
                production_id, canonical_items, set(role_voices.values()))
        except ValueError as exc:
            raise TimelineError(str(exc)) from exc
        if result is None:
            raise TimelineError("That Production no longer exists.")
        return result

    def edit_silence(
        self, production_id: int, part_id: int, seconds: float,
    ) -> dict[str, Any]:
        part = self._part(production_id, part_id)
        if part.get("kind") != "silence":
            raise TimelineError("That Part is not silence.")
        seconds = max(0.1, min(120.0, float(seconds)))
        if not self.records.save_script(production_id, part_id,
                                        f"{seconds:g} seconds of silence", {
                "title": f"{seconds:g}",
                "duration_ms": round(seconds * 1000)}):
            raise TimelineError("The silence could not be updated.")
        return {"id": part_id, "seconds": seconds}

    def insert_asset(
        self, production_id: int, asset_id: int,
        before_part_public_id: str | None = None,
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
        part_id = self.records.insert_asset(
            production_id, asset_id, before_part_public_id)
        if not part_id:
            raise TimelineError("The Asset could not be inserted.")
        return {"id": part_id}

    def replace_asset(
        self, production_id: int, part_id: int, asset_id: int,
    ) -> dict[str, Any]:
        part = self._part(production_id, part_id)
        if part.get("kind") != "asset":
            raise TimelineError("That Part is not a Venture Asset.")
        asset = self.records.asset(asset_id)
        if not asset or not asset.get("filename"):
            raise TimelineError("That Asset does not exist.")
        if not self.records.asset_allowed(
                production_id, asset_id, {"intros", "outros", "stingers"}):
            raise TimelineError(
                "That clip is not in this Venture's reusable clip library.")
        if not self.records.replace_asset(production_id, part_id, asset_id):
            raise TimelineError("The Asset Part could not be replaced.")
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

    def save_draft(
        self, production_id: int, part_id: int, values: dict[str, Any],
    ) -> dict[str, Any]:
        self._part(production_id, part_id)
        if not self.records.save_draft(production_id, part_id, values):
            raise TimelineError("The text states could not be saved.")
        return {"ok": True}

    def save_script(
        self, production_id: int, part_id: int, script: str,
    ) -> dict[str, Any]:
        part = self._part(production_id, part_id)
        canonical = str(script).strip()
        if part.get("kind") in {"speech", "audio", "draft"} and not canonical:
            raise TimelineError("A speech Part needs a script.")
        if not self.records.save_script(production_id, part_id, canonical):
            raise TimelineError("The Part script could not be saved.")
        return {"ok": True}

    def save_editorial(
        self, production_id: int, part_id: int, expected_revision: int,
        values: dict[str, Any],
    ) -> dict[str, Any]:
        part = self._part(production_id, part_id)
        changes: dict[str, Any] = {}
        if "script" in values:
            canonical = str(values["script"] or "").strip()
            if part.get("kind") in {"speech", "audio", "draft"} and not canonical:
                raise TimelineError("A speech Part needs a script.")
            changes["script"] = canonical
        if not changes:
            raise TimelineError("Choose a Part change before saving.")
        try:
            result = self.records.save_editorial(
                production_id, part_id, expected_revision, changes)
        except ValueError as exc:
            raise TimelineError(str(exc)) from exc
        if not result:
            raise TimelineError("The Part could not be updated.")
        if result["status"] == "conflict":
            raise TimelineConflict(
                "This Part changed in another view. Reload it before saving.",
                current_revision=int(result["revision"]))
        return {"ok": True, "changed": bool(result["changed"]),
                "revision": int(result["revision"]),
                "outdated": bool(result["outdated"])}

    def captions(
        self, production_id: int, part_id: int,
    ) -> list[dict[str, Any]]:
        self._part(production_id, part_id)
        return self.transcripts.list_for_part(part_id)
