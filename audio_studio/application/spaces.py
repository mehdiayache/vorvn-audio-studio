"""Space-first use cases independent from the legacy Work hierarchy."""

from __future__ import annotations

from typing import Protocol

from audio_studio.domain.work import DomainValidation


class SpaceRecords(Protocol):
    def list_spaces(self) -> list[dict]: ...
    def space(self, space_id: int) -> dict | None: ...
    def project(self, identifier: str) -> dict | None: ...
    def folders(self, space_id: int) -> list[dict]: ...
    def projects(self, space_id: int) -> list[dict]: ...
    def files(self, space_id: int) -> list[dict]: ...
    def create_space(self, name: str, description: str) -> dict: ...
    def create_folder(
        self, space_id: int, name: str, parent_id: int | None,
    ) -> dict | None: ...
    def create_audiovisual_project(
        self, space_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None: ...
    def attach_file(
        self, project_id: int, file_id: int, purpose: str,
    ) -> bool: ...


class SpaceService:
    def __init__(self, records: SpaceRecords):
        self.records = records

    def list_spaces(self) -> list[dict]:
        return self.records.list_spaces()

    def overview(self, space_id: int) -> dict | None:
        space = self.records.space(space_id)
        if not space:
            return None
        return {
            "space": space,
            "folders": self.records.folders(space_id),
            "projects": self.records.projects(space_id),
            "files": self.records.files(space_id),
        }

    def project(self, identifier: str) -> dict | None:
        return self.records.project(identifier)

    def create_space(self, name: str, description: str = "") -> dict:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this Space.")
        return self.records.create_space(clean_name, description.strip())

    def create_folder(
        self, space_id: int, name: str, parent_id: int | None = None,
    ) -> dict | None:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this Folder.")
        return self.records.create_folder(space_id, clean_name, parent_id)

    def create_audiovisual_project(
        self, space_id: int, name: str, description: str = "",
        folder_id: int | None = None,
    ) -> dict | None:
        clean_name = name.strip()
        if not clean_name:
            raise DomainValidation("Name this audiovisual Project.")
        return self.records.create_audiovisual_project(
            space_id, clean_name, description.strip(), folder_id)

    def attach_file(
        self, project_id: int, file_id: int, purpose: str = "media",
    ) -> bool:
        return self.records.attach_file(project_id, file_id, purpose)
