"""PostgreSQL adapter for the canonical Work hierarchy."""

from audio_studio.infrastructure.postgres import work
from audio_studio.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)


class PostgresWorkRecords:
    def __init__(
        self, *, assets: VentureAssetRepository | None = None,
        accounting: ProductionAccountingRepository | None = None,
        documents: ProductionDocumentRepository | None = None,
        exports: ProductionExportRepository | None = None,
        jobs: JobRepository | None = None,
    ):
        self.asset_records = assets or VentureAssetRepository()
        self.accounting_records = accounting or ProductionAccountingRepository()
        self.documents = documents or ProductionDocumentRepository()
        self.export_records = exports or ProductionExportRepository()
        self.job_records = jobs or JobRepository()

    @staticmethod
    def hierarchy() -> list[dict]:
        return work.hierarchy()

    @staticmethod
    def resolve_id(collection: str, identifier: str) -> int | None:
        return work.resolve_id(collection, identifier)

    @staticmethod
    def production(production_id: int) -> dict | None:
        return work.production_get(production_id)

    @staticmethod
    def resource(kind: str, resource_id: int) -> dict | None:
        return work.resource_get(kind, resource_id)

    @staticmethod
    def overview(collection: str, resource_id: int) -> dict | None:
        getters = {
            "ventures": work.venture_overview,
            "projects": work.project_overview,
            "series": work.series_overview,
        }
        return getters[collection](resource_id)

    def ensure_asset_collections(self, venture_id: int) -> list[dict]:
        return self.asset_records.ensure_collections(venture_id)

    def asset_collections(self, venture_id: int) -> list[dict]:
        return self.asset_records.collections_for_venture(venture_id)

    def assets(self, venture_id: int) -> list[dict]:
        return self.asset_records.list_for_venture(venture_id)

    def parts(self, production_id: int) -> list[dict]:
        return self.documents.parts(production_id)

    def exports(self, production_id: int) -> list[dict]:
        return self.export_records.list(production_id)

    def latest_render_job(
        self, production_id: int, operation: str,
    ) -> dict | None:
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
    def create_venture(name: str, description: str) -> dict | None:
        return work.create_venture(name, description)

    @staticmethod
    def create_project(
        venture_id: int, name: str, description: str,
    ) -> dict | None:
        return work.create_project(venture_id, name, description)

    @staticmethod
    def create_series(
        project_id: int, name: str, description: str,
    ) -> dict | None:
        return work.create_series(project_id, name, description)

    @staticmethod
    def create_production(
        project_id: int, name: str, description: str,
        series_id: int | None = None,
    ) -> dict | None:
        return work.create_production(project_id, name, description, series_id)

    @staticmethod
    def move_production(
        production_id: int, series_id: int | None,
    ) -> dict | None:
        return work.move_production(production_id, series_id)

    @staticmethod
    def update_resource(
        kind: str, resource_id: int, changes: dict,
    ) -> dict | None:
        return work.update_resource(kind, resource_id, changes)

    @staticmethod
    def delete_series(
        series_id: int, make_standalone: bool,
    ) -> dict | None:
        return work.delete_series(series_id, make_standalone)

    @staticmethod
    def archive_resource(kind: str, resource_id: int) -> dict | None:
        return work.archive_resource(kind, resource_id)

    @staticmethod
    def delete_production(resource_id: int) -> list[str] | None:
        return work.delete_production(resource_id)
