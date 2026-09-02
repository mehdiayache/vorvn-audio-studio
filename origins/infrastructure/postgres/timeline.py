"""PostgreSQL adapter for the editable Project timeline."""

from origins.infrastructure.postgres import projects
from origins.infrastructure.postgres.project_document import (
    ProjectDocumentRepository,
)
from origins.infrastructure.postgres.files import (
    FileRepository,
)


class PostgresTimelineRecords:
    def __init__(
        self, *, documents: ProjectDocumentRepository | None = None,
        files: FileRepository | None = None,
    ):
        self.documents = documents or ProjectDocumentRepository()
        self.files = files or FileRepository()

    @staticmethod
    def project(project_id: int) -> dict | None:
        return projects.get(project_id)

    def part(self, project_id: int, part_id: int) -> dict | None:
        return self.documents.part(project_id, part_id)

    def reorder(self, project_id: int, order: list[int]) -> bool:
        return self.documents.reorder(project_id, order)

    def set_enabled(
        self, project_id: int, part_id: int, enabled: bool,
    ) -> bool:
        return self.documents.set_enabled(project_id, part_id, enabled)

    def create_part(
        self, project_id: int, values: dict,
        before_part_public_id: str | None = None,
    ) -> int | None:
        return self.documents.create_part(
            project_id, values, before_part_public_id)

    def import_parts(
        self, project_id: int, items: list[dict],
        voice_identity_ids: set[str],
        exact_routes: list[dict] | None = None,
    ) -> dict | None:
        return self.documents.import_parts(
            project_id, items, voice_identity_ids, exact_routes)

    def file(self, file_id: int) -> dict | None:
        return self.files.get(file_id)

    def file_allowed(
        self, project_id: int, file_id: int,
    ) -> bool:
        return self.files.allowed_for_project(project_id, file_id)

    def insert_file(
        self, project_id: int, file_id: int,
        before_part_public_id: str | None = None,
    ) -> int | None:
        return self.documents.insert_file(
            project_id, file_id, before_part_public_id)

    def replace_file(
        self, project_id: int, part_id: int, file_id: int,
    ) -> bool:
        return self.documents.replace_file(project_id, part_id, file_id)

    def duplicate(
        self, project_id: int, part_id: int, filename: str,
    ) -> int | None:
        return self.documents.duplicate(project_id, part_id, filename)

    def delete(self, project_id: int, ids: list[int]) -> list[str] | None:
        return self.documents.delete(project_id, ids)

    def move(
        self, source_project_id: int, ids: list[int],
        destination_project_id: int,
    ) -> bool:
        return self.documents.move(
            source_project_id, ids, destination_project_id)

    def save_script(self, project_id: int, part_id: int, script: str,
                    values: dict | None = None) -> bool:
        return self.documents.save_script(
            project_id, part_id, script, values)

    def save_editorial(self, project_id: int, part_id: int,
                       expected_revision: int, values: dict) -> dict | None:
        return self.documents.save_editorial(
            project_id, part_id, expected_revision, values)

    def save_draft(self, project_id: int, part_id: int,
                   values: dict) -> bool:
        return self.documents.save_draft(project_id, part_id, values)
