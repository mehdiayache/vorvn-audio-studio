"""Workspace-first application use cases."""

from __future__ import annotations

from typing import Protocol

from origins.domain.work import DomainValidation


class WorkspaceRecords(Protocol):
    def list_workspaces(self) -> list[dict]: ...
    def workspace(self, workspace_id: int) -> dict | None: ...
    def project(self, identifier: str) -> dict | None: ...
    def folders(self, workspace_id: int) -> list[dict]: ...
    def projects(self, workspace_id: int) -> list[dict]: ...
    def files(self, workspace_id: int) -> list[dict]: ...
    def create_workspace(self, name: str, description: str) -> dict: ...
    def create_folder(
        self, workspace_id: int, name: str, parent_id: int | None,
    ) -> dict | None: ...
    def create_audiovisual_project(
        self, workspace_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None: ...
    def attach_file(
        self, project_id: int, file_id: int, purpose: str,
    ) -> bool: ...


class WorkspaceService:
    def __init__(self, records: WorkspaceRecords):
        self.records = records

    def list_workspaces(self) -> list[dict]:
        return self.records.list_workspaces()

    def overview(self, workspace_id: int) -> dict | None:
        workspace = self.records.workspace(workspace_id)
        if not workspace:
            return None
        return {
            "workspace": workspace,
            "folders": self.records.folders(workspace_id),
            "projects": self.records.projects(workspace_id),
            "files": self.records.files(workspace_id),
        }

    def project(self, identifier: str) -> dict | None:
        return self.records.project(identifier)

    def create_workspace(self, name: str, description: str = "") -> dict:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this Workspace.")
        return self.records.create_workspace(clean_name, description.strip())

    def create_folder(
        self, workspace_id: int, name: str, parent_id: int | None = None,
    ) -> dict | None:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this Folder.")
        return self.records.create_folder(workspace_id, clean_name, parent_id)

    def create_audiovisual_project(
        self, workspace_id: int, name: str, description: str = "",
        folder_id: int | None = None,
    ) -> dict | None:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this audiovisual Project.")
        return self.records.create_audiovisual_project(
            workspace_id, clean_name, description.strip(), folder_id)

    def attach_file(
        self, project_id: int, file_id: int, purpose: str = "media",
    ) -> bool:
        return self.records.attach_file(project_id, file_id, purpose)
