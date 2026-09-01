"""Canonical Venture, Project, Series and Production use cases."""

from __future__ import annotations

from typing import Any, Protocol

from audio_studio.domain.work import DomainValidation


KINDS = {"ventures": "venture", "projects": "project",
         "series": "series", "productions": "production"}


class WorkRecords(Protocol):
    def hierarchy(self) -> list[dict]: ...
    def resolve_id(self, collection: str, identifier: str) -> int | None: ...
    def production(self, production_id: int) -> dict | None: ...
    def space(self, space_id: int) -> dict | None: ...
    def resource(self, kind: str, resource_id: int) -> dict | None: ...
    def overview(self, collection: str, resource_id: int) -> dict | None: ...
    def ensure_asset_collections(self, venture_id: int) -> list[dict]: ...
    def asset_collections(self, venture_id: int) -> list[dict]: ...
    def assets(self, venture_id: int) -> list[dict]: ...
    def production_assets(self, production_id: int) -> list[dict]: ...
    def director_asset_ids(self, production_id: int) -> list[int]: ...
    def project_file_ids(self, project_id: int) -> list[int]: ...
    def attach_director_asset(
        self, production_id: int, asset_id: int,
    ) -> bool | None: ...
    def detach_director_asset(
        self, production_id: int, asset_id: int,
    ) -> bool | None: ...
    def parts(self, production_id: int) -> list[dict]: ...
    def exports(self, production_id: int) -> list[dict]: ...
    def latest_render_job(
        self, production_id: int, operation: str,
    ) -> dict | None: ...
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
    def delete_production(self, resource_id: int) -> list[str] | None: ...


class WorkWorkspace(Protocol):
    def discard(self, filename: str) -> None: ...


class WorkService:
    def __init__(self, records: WorkRecords, workspace: WorkWorkspace):
        self.records = records
        self.workspace = workspace

    def hierarchy(self) -> list[dict[str, Any]]:
        return self.records.hierarchy()

    def _internal_id(self, collection: str, identifier: int | str) -> int | None:
        if isinstance(identifier, int) or str(identifier).isdigit():
            return int(identifier)
        return self.records.resolve_id(collection, str(identifier))

    def resource(
        self, collection: str, resource_id: int | str,
    ) -> dict[str, Any] | None:
        internal_id = self._internal_id(collection, resource_id)
        if internal_id is None:
            return None
        kind = KINDS[collection]
        return (self.records.production(internal_id)
                if kind == "production"
                else self.records.resource(kind, internal_id))

    def overview(
        self, collection: str, resource_id: int | str,
    ) -> dict[str, Any] | None:
        internal_id = self._internal_id(collection, resource_id)
        return (self.records.overview(collection, internal_id)
                if internal_id is not None else None)

    def venture_assets(self, venture_id: int | str) -> dict[str, Any] | None:
        internal_id = self._internal_id("ventures", venture_id)
        if internal_id is None:
            return None
        venture = self.records.resource("venture", internal_id)
        if not venture:
            return None
        return {
            "venture": venture,
            "collections": self.records.asset_collections(internal_id),
            "assets": self.records.assets(internal_id),
        }

    def production_assets(self, production_id: int | str) -> dict[str, Any] | None:
        internal_id = self._internal_id("productions", production_id)
        if internal_id is None:
            return None
        production = self.records.production(internal_id)
        if not production:
            return None
        if production.get("space_id") is not None:
            space = self.records.space(int(production["space_id"]))
            if not space:
                return None
            return {
                "space": space,
                "collections": [],
                "assets": self.records.production_assets(internal_id),
                "project_file_ids": self.records.project_file_ids(internal_id),
                "director_asset_ids": self.records.director_asset_ids(internal_id),
            }
        library = self.venture_assets(int(production["trail"][0]["id"]))
        if not library:
            return None
        return {
            **library,
            "assets": self.records.production_assets(internal_id),
            "project_file_ids": self.records.project_file_ids(internal_id),
            "director_asset_ids": self.records.director_asset_ids(internal_id),
        }

    def attach_director_asset(
        self, production_id: int | str, asset_id: int,
    ) -> dict[str, Any] | None:
        internal_id = self._internal_id("productions", production_id)
        if internal_id is None:
            return None
        attached = self.records.attach_director_asset(internal_id, asset_id)
        if attached is None:
            raise DomainValidation(
                "Director accepts image and video Assets available to this Production.")
        return {"asset_id": asset_id, "attached": True}

    def detach_director_asset(
        self, production_id: int | str, asset_id: int,
    ) -> dict[str, Any] | None:
        internal_id = self._internal_id("productions", production_id)
        if internal_id is None:
            return None
        detached = self.records.detach_director_asset(internal_id, asset_id)
        if detached is None:
            return None
        return {"asset_id": asset_id, "attached": False}

    def production_editor(self, production_id: int | str) -> dict[str, Any] | None:
        internal_id = self._internal_id("productions", production_id)
        if internal_id is None:
            return None
        production = self.records.production(internal_id)
        if not production:
            return None
        parts = self.records.parts(internal_id)
        exports = self.records.exports(internal_id)
        export_job = self.records.latest_render_job(internal_id, "export")
        visible = [part for part in parts if part.get("kind") != "stitch"]
        accounting = self.records.accounting(internal_id)
        return {
            **production, "parts": parts, "exports": exports,
            "export_job": export_job,
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
        allowed = {"voice_identity_id", "language"}
        defaults = values or {}
        unknown = set(defaults) - allowed
        if unknown:
            raise DomainValidation(
                f"Unknown Series default: {sorted(unknown)[0]}.")
        return {
            key: str(value).strip()
            for key, value in defaults.items()
            if value not in (None, "") and str(value).strip()
        }

    def remove(
        self, collection: str, resource_id: int,
        make_standalone: bool = False,
    ) -> dict[str, Any] | None:
        kind = KINDS[collection]
        if kind == "series":
            return self.records.delete_series(resource_id, make_standalone)
        if kind == "production":
            files = self.records.delete_production(resource_id)
            if files is None:
                return None
            for filename in files:
                self.workspace.discard(filename)
            return {"id": resource_id, "type": "production", "deleted": True}
        return self.records.archive_resource(kind, resource_id)
