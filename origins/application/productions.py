"""Audiovisual Production use cases independent from HTTP and PostgreSQL."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.work import DomainValidation


class ProductionRecords(Protocol):
    def resolve_production_id(self, identifier: str) -> int | None: ...
    def production(self, production_id: int) -> dict | None: ...
    def workspace(self, workspace_id: int) -> dict | None: ...
    def folders(self, workspace_id: int) -> list[dict]: ...
    def production_file_usages(self, production_id: int) -> list[dict]: ...
    def library_file_ids(self, production_id: int) -> list[int]: ...
    def production_file_ids(self, production_id: int) -> list[int]: ...
    def attach_library_file(self, production_id: int, file_id: int) -> bool | None: ...
    def detach_library_file(self, production_id: int, file_id: int) -> bool | None: ...
    def parts(self, production_id: int) -> list[dict]: ...
    def exports(self, production_id: int) -> list[dict]: ...
    def latest_render_job(self, production_id: int, operation: str) -> dict | None: ...
    def accounting(self, production_id: int) -> dict: ...
    def update_production(self, production_id: int, changes: dict) -> dict | None: ...
    def delete_production(self, production_id: int) -> list[str] | None: ...


class ProductionWorkspace(Protocol):
    def discard(self, filename: str) -> None: ...


class ProductionService:
    def __init__(self, records: ProductionRecords, workspace: ProductionWorkspace):
        self.records = records
        self.workspace = workspace

    def _production_id(self, identifier: int | str) -> int | None:
        if isinstance(identifier, int) or str(identifier).isdigit():
            return int(identifier)
        return self.records.resolve_production_id(str(identifier))

    def production_file_usages(self, identifier: int | str) -> dict[str, Any] | None:
        production_id = self._production_id(identifier)
        if production_id is None:
            return None
        production = self.records.production(production_id)
        if not production or production.get("workspace_id") is None:
            return None
        workspace = self.records.workspace(int(production["workspace_id"]))
        if not workspace:
            return None
        return {
            "workspace": workspace,
            "folders": self.records.folders(int(production["workspace_id"])),
            "files": self.records.production_file_usages(production_id),
            "production_file_ids": self.records.production_file_ids(production_id),
            "library_file_ids": self.records.library_file_ids(production_id),
        }

    def attach_library_file(
        self, identifier: int | str, file_id: int,
    ) -> dict[str, Any] | None:
        production_id = self._production_id(identifier)
        if production_id is None:
            return None
        attached = self.records.attach_library_file(production_id, file_id)
        if attached is None:
            raise DomainValidation(
                "The Production Library accepts Files from this Workspace.")
        return {"file_id": file_id, "attached": True}

    def detach_library_file(
        self, identifier: int | str, file_id: int,
    ) -> dict[str, Any] | None:
        production_id = self._production_id(identifier)
        if production_id is None:
            return None
        detached = self.records.detach_library_file(production_id, file_id)
        return ({"file_id": file_id, "attached": False}
                if detached is not None else None)

    def production_editor(self, identifier: int | str) -> dict[str, Any] | None:
        production_id = self._production_id(identifier)
        if production_id is None:
            return None
        production = self.records.production(production_id)
        if not production or production.get("workspace_id") is None:
            return None
        parts = self.records.parts(production_id)
        accounting = self.records.accounting(production_id)
        visible = [part for part in parts if part.get("kind") != "stitch"]
        return {
            **production,
            "parts": parts,
            "exports": self.records.exports(production_id),
            "export_job": self.records.latest_render_job(production_id, "export"),
            "total_cost": accounting["historical_spend"],
            "current_sequence_cost": accounting["current_sequence_cost"],
            "accounting": accounting,
            "total_bytes": sum(part["size_bytes"] or 0 for part in visible),
        }

    def update_production(self, production_id: int, changes: dict[str, Any]) -> dict | None:
        return self.records.update_production(production_id, changes)

    def delete_production(self, production_id: int) -> dict[str, Any] | None:
        filenames = self.records.delete_production(production_id)
        if filenames is None:
            return None
        for filename in filenames:
            self.workspace.discard(filename)
        return {"id": production_id, "type": "production", "deleted": True}
