"""Canonical Venture, Project, Series and Production use cases."""

from __future__ import annotations

from typing import Any, Protocol

from audio_studio.domain.work import DomainValidation


KINDS = {"ventures": "venture", "projects": "project",
         "series": "series", "productions": "production"}


class WorkRecords(Protocol):
    def hierarchy(self) -> list[dict]: ...
    def production(self, production_id: int) -> dict | None: ...
    def resource(self, kind: str, resource_id: int) -> dict | None: ...
    def overview(self, collection: str, resource_id: int) -> dict | None: ...
    def ensure_asset_collections(self, venture_id: int) -> list[dict]: ...
    def asset_collections(self, venture_id: int) -> list[dict]: ...
    def assets(self, venture_id: int) -> list[dict]: ...
    def parts(self, production_id: int) -> list[dict]: ...
    def exports(self, production_id: int) -> list[dict]: ...
    def accounting(self, production_id: int) -> dict: ...
    def create_venture(self, name: str, description: str) -> dict | None: ...
    def create_project(
        self, venture_id: int, name: str, description: str,
    ) -> dict | None: ...
    def create_series(
        self, project_id: int, name: str, description: str,
    ) -> dict | None: ...
    def create_production(
        self, project_id: int, name: str, description: str,
        series_id: int | None = None,
    ) -> dict | None: ...
    def move_production(
        self, production_id: int, series_id: int | None,
    ) -> dict | None: ...
    def update_resource(
        self, kind: str, resource_id: int, changes: dict,
    ) -> dict | None: ...
    def delete_series(
        self, series_id: int, make_standalone: bool,
    ) -> dict | None: ...
    def archive_resource(self, kind: str, resource_id: int) -> dict | None: ...


class WorkService:
    def __init__(self, records: WorkRecords):
        self.records = records

    def hierarchy(self) -> list[dict[str, Any]]:
        return self.records.hierarchy()

    def resource(
        self, collection: str, resource_id: int,
    ) -> dict[str, Any] | None:
        kind = KINDS[collection]
        return (self.records.production(resource_id)
                if kind == "production"
                else self.records.resource(kind, resource_id))

    def overview(
        self, collection: str, resource_id: int,
    ) -> dict[str, Any] | None:
        return self.records.overview(collection, resource_id)

    def venture_assets(self, venture_id: int) -> dict[str, Any] | None:
        venture = self.records.resource("venture", venture_id)
        if not venture:
            return None
        return {
            "venture": venture,
            "collections": self.records.asset_collections(venture_id),
            "assets": self.records.assets(venture_id),
        }

    def production_assets(self, production_id: int) -> dict[str, Any] | None:
        production = self.records.production(production_id)
        if not production or not production.get("trail"):
            return None
        return self.venture_assets(int(production["trail"][0]["id"]))

    def production_editor(self, production_id: int) -> dict[str, Any] | None:
        production = self.records.production(production_id)
        if not production:
            return None
        parts = self.records.parts(production_id)
        exports = self.records.exports(production_id)
        visible = [part for part in parts if part.get("kind") != "stitch"]
        accounting = self.records.accounting(production_id)
        return {
            **production, "parts": parts, "exports": exports,
            "total_cost": accounting["historical_spend"],
            "current_sequence_cost": accounting["current_sequence_cost"],
            "accounting": accounting,
            "total_bytes": sum(part["size_bytes"] or 0 for part in visible),
        }

    def create(
        self, collection: str, parent_id: int | None, name: str,
        description: str = "",
    ) -> dict[str, Any] | None:
        if collection == "ventures":
            created = self.records.create_venture(name, description)
            if created:
                self.records.ensure_asset_collections(int(created["id"]))
            return created
        if collection == "projects":
            return self.records.create_project(
                int(parent_id or 0), name, description)
        if collection == "series":
            return self.records.create_series(
                int(parent_id or 0), name, description)
        if collection == "productions":
            return self.records.create_production(
                int(parent_id or 0), name, description)
        raise DomainValidation("Unknown resource type.")

    def create_in_series(
        self, series_id: int, name: str, description: str = "",
    ) -> dict[str, Any] | None:
        series = self.records.resource("series", series_id)
        if not series:
            return None
        project_id = int(series["parent_key"].split(":", 1)[1])
        return self.records.create_production(
            project_id, name, description, series_id)

    def update(
        self, collection: str, resource_id: int, changes: dict[str, Any],
    ) -> dict[str, Any] | None:
        kind = KINDS[collection]
        changes = dict(changes)
        if kind == "series" and "defaults" in changes:
            changes["defaults"] = self._series_defaults(changes["defaults"])
        if kind == "production" and "series_id" in changes:
            series_id = changes.pop("series_id")
            moved = self.records.move_production(
                resource_id,
                None if series_id in (None, "") else int(series_id))
            if not changes:
                return moved
        return self.records.update_resource(kind, resource_id, changes)

    @staticmethod
    def _series_defaults(values: dict | None) -> dict:
        allowed = {
            "voice", "voice_identity_id", "engine", "model", "format",
            "language", "instruction", "speech_mode", "rate", "pitch",
            "volume", "seed",
        }
        defaults = values or {}
        unknown = set(defaults) - allowed
        if unknown:
            raise DomainValidation(
                f"Unknown Series default: {sorted(unknown)[0]}.")
        if defaults.get("engine") not in {
                None, "", "audio", "omni", "qwen_tts"}:
            raise DomainValidation(
                "Series speech engine must be Audio, Omni or Qwen3 TTS.")
        if defaults.get("model") not in {None, "", "plus", "flash", "vc"}:
            raise DomainValidation(
                "Series quality must be Plus, Flash or Voice Clone.")
        if defaults.get("speech_mode") not in {
                None, "", "exact", "directed"}:
            raise DomainValidation(
                "Series reading mode must be exact or directed.")
        return {key: value for key, value in defaults.items()
                if value not in (None, "")}

    def remove(
        self, collection: str, resource_id: int,
        make_standalone: bool = False,
    ) -> dict[str, Any] | None:
        kind = KINDS[collection]
        if kind == "series":
            return self.records.delete_series(resource_id, make_standalone)
        return self.records.archive_resource(kind, resource_id)
