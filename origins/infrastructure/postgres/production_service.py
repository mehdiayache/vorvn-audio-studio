"""PostgreSQL adapter for audiovisual Production use cases."""

from origins.infrastructure.postgres import productions
from origins.infrastructure.postgres.accounting import ProductionAccountingRepository
from origins.infrastructure.postgres.exports import ProductionExportRepository
from origins.infrastructure.postgres.jobs import JobRepository
from origins.infrastructure.postgres.production_document import ProductionDocumentRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository
from origins.infrastructure.postgres.files import FileRepository


class PostgresProductionRecords:
    def __init__(
        self, *, files: FileRepository | None = None,
        accounting: ProductionAccountingRepository | None = None,
        documents: ProductionDocumentRepository | None = None,
        exports: ProductionExportRepository | None = None,
        jobs: JobRepository | None = None,
        workspaces: WorkspaceRepository | None = None,
    ):
        self.file_records = files or FileRepository()
        self.accounting_records = accounting or ProductionAccountingRepository()
        self.documents = documents or ProductionDocumentRepository()
        self.export_records = exports or ProductionExportRepository()
        self.job_records = jobs or JobRepository()
        self.workspace_records = workspaces or WorkspaceRepository()

    @staticmethod
    def resolve_production_id(identifier: str) -> int | None:
        return productions.resolve_production_id(identifier)

    @staticmethod
    def production(production_id: int) -> dict | None:
        return productions.get(production_id)

    def workspace(self, workspace_id: int) -> dict | None:
        return self.workspace_records.workspace(workspace_id)

    def folders(self, workspace_id: int) -> list[dict]:
        return self.workspace_records.folders(workspace_id)

    def production_file_usages(self, production_id: int) -> list[dict]:
        return self.file_records.list_for_production(production_id)

    def library_file_ids(self, production_id: int) -> list[int]:
        return self.file_records.library_file_ids(production_id)

    def production_file_ids(self, production_id: int) -> list[int]:
        return self.file_records.production_file_ids(production_id)

    def attach_library_file(self, production_id: int, file_id: int) -> bool | None:
        return self.file_records.attach_to_production_library(production_id, file_id)

    def detach_library_file(self, production_id: int, file_id: int) -> bool | None:
        return self.file_records.detach_from_production_library(production_id, file_id)

    def parts(self, production_id: int) -> list[dict]:
        return self.documents.parts(production_id)

    def exports(self, production_id: int) -> list[dict]:
        return self.export_records.list(production_id)

    def latest_render_job(self, production_id: int, operation: str) -> dict | None:
        job = self.job_records.latest_for_production(
            production_id, kind="render", operation=operation)
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

    def accounting(self, production_id: int) -> dict:
        return self.accounting_records.one(production_id)

    @staticmethod
    def update_production(production_id: int, changes: dict) -> dict | None:
        return productions.update(production_id, changes)

    def create_audiovisual_production(
        self, workspace_id: int, name: str, description: str,
        folder_id: int | None,
    ) -> dict | None:
        return self.workspace_records.create_audiovisual_production(
            workspace_id, name, description, folder_id)

    @staticmethod
    def delete_production(production_id: int) -> bool:
        return productions.delete(production_id)
