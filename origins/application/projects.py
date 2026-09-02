"""Audiovisual Project use cases independent from HTTP and PostgreSQL."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.work import DomainValidation


class ProjectRecords(Protocol):
    def resolve_project_id(self, identifier: str) -> int | None: ...
    def project(self, project_id: int) -> dict | None: ...
    def workspace(self, workspace_id: int) -> dict | None: ...
    def project_file_usages(self, project_id: int) -> list[dict]: ...
    def visual_file_ids(self, project_id: int) -> list[int]: ...
    def project_file_ids(self, project_id: int) -> list[int]: ...
    def attach_visual_file(self, project_id: int, file_id: int) -> bool | None: ...
    def detach_visual_file(self, project_id: int, file_id: int) -> bool | None: ...
    def parts(self, project_id: int) -> list[dict]: ...
    def exports(self, project_id: int) -> list[dict]: ...
    def latest_render_job(self, project_id: int, operation: str) -> dict | None: ...
    def accounting(self, project_id: int) -> dict: ...
    def update_project(self, project_id: int, changes: dict) -> dict | None: ...
    def delete_project(self, project_id: int) -> list[str] | None: ...


class ProjectWorkspace(Protocol):
    def discard(self, filename: str) -> None: ...


class ProjectService:
    def __init__(self, records: ProjectRecords, workspace: ProjectWorkspace):
        self.records = records
        self.workspace = workspace

    def _project_id(self, identifier: int | str) -> int | None:
        if isinstance(identifier, int) or str(identifier).isdigit():
            return int(identifier)
        return self.records.resolve_project_id(str(identifier))

    def project_file_usages(self, identifier: int | str) -> dict[str, Any] | None:
        project_id = self._project_id(identifier)
        if project_id is None:
            return None
        project = self.records.project(project_id)
        if not project or project.get("workspace_id") is None:
            return None
        workspace = self.records.workspace(int(project["workspace_id"]))
        if not workspace:
            return None
        return {
            "workspace": workspace,
            "files": self.records.project_file_usages(project_id),
            "project_file_ids": self.records.project_file_ids(project_id),
            "visual_file_ids": self.records.visual_file_ids(project_id),
        }

    def attach_visual_file(
        self, identifier: int | str, file_id: int,
    ) -> dict[str, Any] | None:
        project_id = self._project_id(identifier)
        if project_id is None:
            return None
        attached = self.records.attach_visual_file(project_id, file_id)
        if attached is None:
            raise DomainValidation(
                "Visuals accepts image and video Files from this Workspace.")
        return {"file_id": file_id, "attached": True}

    def detach_visual_file(
        self, identifier: int | str, file_id: int,
    ) -> dict[str, Any] | None:
        project_id = self._project_id(identifier)
        if project_id is None:
            return None
        detached = self.records.detach_visual_file(project_id, file_id)
        return ({"file_id": file_id, "attached": False}
                if detached is not None else None)

    def project_editor(self, identifier: int | str) -> dict[str, Any] | None:
        project_id = self._project_id(identifier)
        if project_id is None:
            return None
        project = self.records.project(project_id)
        if not project or project.get("workspace_id") is None:
            return None
        parts = self.records.parts(project_id)
        accounting = self.records.accounting(project_id)
        visible = [part for part in parts if part.get("kind") != "stitch"]
        return {
            **project,
            "parts": parts,
            "exports": self.records.exports(project_id),
            "export_job": self.records.latest_render_job(project_id, "export"),
            "total_cost": accounting["historical_spend"],
            "current_sequence_cost": accounting["current_sequence_cost"],
            "accounting": accounting,
            "total_bytes": sum(part["size_bytes"] or 0 for part in visible),
        }

    def update_project(self, project_id: int, changes: dict[str, Any]) -> dict | None:
        return self.records.update_project(project_id, changes)

    def delete_project(self, project_id: int) -> dict[str, Any] | None:
        filenames = self.records.delete_project(project_id)
        if filenames is None:
            return None
        for filename in filenames:
            self.workspace.discard(filename)
        return {"id": project_id, "type": "project", "deleted": True}
