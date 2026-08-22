"""Production timeline use cases."""

from __future__ import annotations

from typing import Any, Protocol


class TimelineRecords(Protocol):
    def production(self, production_id: int) -> dict | None: ...
    def part(self, production_id: int, part_id: int) -> dict | None: ...
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
    def asset_allowed(
        self, production_id: int, asset_id: int,
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
            "spoken_profile": values.get("spoken_profile") or "spoken_1",
            "authored_role": " ".join(
                str(values.get("authored_role") or "").split()) or None,
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
            "enable_ssml": bool(values.get("enable_ssml", False)),
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
        roles: dict[str, dict[str, Any]] = {}
        for index, item in enumerate(items, start=1):
            if item.get("type") != "speech":
                continue
            label = " ".join(str(item["role"]).split())
            if not label:
                raise TimelineError(f"Item {index}: role cannot be blank.")
            key = label.casefold()
            roles.setdefault(key, {"label": label, "item_number": index})

        mapped_roles: dict[str, tuple[str, str]] = {}
        for label, identity_id in role_voices.items():
            normalized_label = " ".join(str(label).split())
            key = normalized_label.casefold()
            if key in mapped_roles and mapped_roles[key][1] != identity_id:
                raise TimelineError(
                    f"Role {normalized_label} has more than one Voice mapping.")
            mapped_roles[key] = (normalized_label, str(identity_id))

        missing = sorted(
            roles[key]["label"] for key in set(roles) - set(mapped_roles))
        extra = sorted(
            mapped_roles[key][0]
            for key in set(mapped_roles) - set(roles))
        if missing:
            raise TimelineError(
                "Map every role before importing. Missing: "
                + ", ".join(missing))
        if extra:
            raise TimelineError(
                "Remove role mappings that are not in this document: "
                + ", ".join(extra))
        for role, identity_id in mapped_roles.values():
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
            language = str(item.get("language") or "Auto")
            instruction = str(item.get("instruction") or "")
            output_format = str(item.get("format") or "mp3")
            role_key = " ".join(str(item["role"]).split()).casefold()
            role = roles[role_key]["label"]
            for label, value in (
                ("text", text), ("language", language),
                ("format", output_format),
            ):
                if not value.strip():
                    raise TimelineError(
                        f"Item {number}: {label} cannot be blank.")
            canonical_items.append({
                "kind": "draft",
                "authored_role": role,
                "text": text,
                "text_raw": text,
                "text_shaped": None,
                "text_tagged": None,
                "text_state": "raw",
                "voice_identity_id": mapped_roles[role_key][1],
                "binding_id": None,
                "catalogue_voice_id": None,
                "capability_id": None,
                "language": language,
                "speech_mode": item.get("speech_mode") or "exact",
                "instruction": instruction,
                "rate": float(item.get("rate", 1)),
                "pitch": float(item.get("pitch", 1)),
                "volume": int(item.get("volume", 50)),
                "seed": int(item.get("seed", 0)),
                "format": output_format,
                "duration_ms": 0,
            })
        try:
            result = self.records.import_parts(
                production_id, canonical_items,
                {identity_id for _, identity_id in mapped_roles.values()})
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
        if not self.records.asset_allowed(production_id, asset_id):
            raise TimelineError(
                "That audio is not available to this Production.")
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
        if not self.records.asset_allowed(production_id, asset_id):
            raise TimelineError(
                "That audio is not available to this Production.")
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
        files = self.records.delete(production_id, selected)
        if files is None:
            raise TimelineError("Those Parts could not be deleted.")
        for filename in files:
            self.workspace.discard(filename)
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
        if "authored_role" in values:
            changes["authored_role"] = str(values["authored_role"] or "").strip() or None
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
