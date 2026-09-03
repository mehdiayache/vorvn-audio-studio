"""Project grouping use cases, independent from HTTP and PostgreSQL."""

from __future__ import annotations

from typing import Any, Protocol

from origins.domain.work import DomainValidation


class ProjectRecords(Protocol):
    def list_for_workspace(self, workspace_id: int) -> list[dict]: ...
    def project(self, identifier: str) -> dict | None: ...
    def productions(self, project_id: int) -> list[dict]: ...
    def create(
        self, workspace_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None: ...
    def update(self, project_id: int, changes: dict[str, Any]) -> dict | None: ...
    def delete(self, project_id: int) -> bool: ...


class ProjectService:
    def __init__(self, records: ProjectRecords):
        self.records = records

    def list_for_workspace(self, workspace_id: int) -> list[dict]:
        return self.records.list_for_workspace(workspace_id)

    def project(self, identifier: str) -> dict[str, Any] | None:
        project = self.records.project(identifier)
        if not project:
            return None
        return {**project, "productions": self.records.productions(int(project["id"]))}

    def create(
        self, workspace_id: int, name: str, description: str = "",
        folder_id: int | None = None,
    ) -> dict | None:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this Project.")
        return self.records.create(
            workspace_id, clean_name, description.strip(), folder_id)

    def update(self, project_id: int, changes: dict[str, Any]) -> dict | None:
        values = dict(changes)
        if "name" in values:
            clean_name = str(values["name"] or "").strip()
            if not clean_name:
                raise DomainValidation("Name this Project.")
            values["name"] = clean_name
        if "description" in values and values["description"] is not None:
            values["description"] = str(values["description"]).strip()
        return self.records.update(project_id, values)

    def delete(self, project_id: int) -> dict[str, Any] | None:
        if not self.records.delete(project_id):
            return None
        return {"id": project_id, "type": "project", "deleted": True}
