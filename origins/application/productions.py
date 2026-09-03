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
    def project_membership_valid(self, production_id: int, project_id: int) -> bool: ...
    def folder_context_valid(
        self, workspace_id: int, project_id: int | None, folder_id: int,
    ) -> bool: ...
    def delete_production(self, production_id: int) -> bool: ...


class ProductionService:
    def __init__(self, records: ProductionRecords):
        self.records = records

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
        production = self.records.production(production_id)
        if not production:
            return None
        project_id = changes.get("project_id")
        if project_id is not None and not self.records.project_membership_valid(
            production_id, int(project_id),
        ):
            raise DomainValidation(
                "A Production and its Project must belong to the same Workspace.")
        values = dict(changes)
        target_project_id = values.get("project_id", production.get("project_id"))
        target_folder_id = values.get("folder_id", production.get("folder_id"))
        if target_folder_id is not None and not self.records.folder_context_valid(
            int(production["workspace_id"]), target_project_id,
            int(target_folder_id),
        ):
            if "project_id" in values and "folder_id" not in values:
                values["folder_id"] = None
            else:
                raise DomainValidation(
                    "A Production Folder must belong to the same Workspace and Project context.")
        return self.records.update_production(production_id, values)

    def delete_production(self, production_id: int) -> dict[str, Any] | None:
        if not self.records.delete_production(production_id):
            return None
        return {"id": production_id, "type": "production", "deleted": True}
