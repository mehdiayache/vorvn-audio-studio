"""PostgreSQL adapter for audiovisual Project use cases."""

from origins.infrastructure.postgres import projects
from origins.infrastructure.postgres.accounting import ProjectAccountingRepository
from origins.infrastructure.postgres.exports import ProjectExportRepository
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.project_document import ProjectDocumentRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository
from origins.infrastructure.postgres.files import FileRepository


class PostgresProjectRecords:
    def __init__(
        self, *, files: FileRepository | None = None,
        accounting: ProjectAccountingRepository | None = None,
        documents: ProjectDocumentRepository | None = None,
        exports: ProjectExportRepository | None = None,
        jobs: JobRepository | None = None,
        workspaces: WorkspaceRepository | None = None,
    ):
        self.file_records = files or FileRepository()
        self.accounting_records = accounting or ProjectAccountingRepository()
        self.documents = documents or ProjectDocumentRepository()
        self.export_records = exports or ProjectExportRepository()
        self.job_records = jobs or JobRepository()
        self.workspace_records = workspaces or WorkspaceRepository()

    @staticmethod
    def resolve_project_id(identifier: str) -> int | None:
        return projects.resolve_project_id(identifier)

    @staticmethod
    def project(project_id: int) -> dict | None:
        return projects.get(project_id)

    def workspace(self, workspace_id: int) -> dict | None:
        return self.workspace_records.workspace(workspace_id)

    def folders(self, workspace_id: int) -> list[dict]:
        return self.workspace_records.folders(workspace_id)

    def project_file_usages(self, project_id: int) -> list[dict]:
        return self.file_records.list_for_project(project_id)

    def library_file_ids(self, project_id: int) -> list[int]:
        return self.file_records.library_file_ids(project_id)

    def project_file_ids(self, project_id: int) -> list[int]:
        return self.file_records.project_file_ids(project_id)

    def attach_library_file(self, project_id: int, file_id: int) -> bool | None:
        return self.file_records.attach_to_project_library(project_id, file_id)

    def detach_library_file(self, project_id: int, file_id: int) -> bool | None:
        return self.file_records.detach_from_project_library(project_id, file_id)

    def parts(self, project_id: int) -> list[dict]:
        return self.documents.parts(project_id)

    def exports(self, project_id: int) -> list[dict]:
        return self.export_records.list(project_id)

    def latest_render_job(self, project_id: int, operation: str) -> dict | None:
        job = self.job_records.latest_for_project(
            project_id, kind="render", operation=operation)
        if not job:
            return None
        return {
            "id": str(job.public_id), "type": job.kind,
            "status": job.status.value, "progress": job.progress,
            "detail": job.detail, "error": job.error or None,
            "retries": job.retries,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
            "result": job.result or {}, "part_id": job.part_id,
        }

    def accounting(self, project_id: int) -> dict:
        return self.accounting_records.one(project_id)

    @staticmethod
    def update_project(project_id: int, changes: dict) -> dict | None:
        return projects.update(project_id, changes)

    def create_audiovisual_project(
        self, workspace_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None:
        return self.workspace_records.create_audiovisual_project(
            workspace_id, name, description, folder_id)

    @staticmethod
    def delete_project(project_id: int) -> list[str] | None:
        return [] if projects.delete(project_id) else None
