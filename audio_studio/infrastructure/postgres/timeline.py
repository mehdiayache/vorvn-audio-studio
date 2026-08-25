"""PostgreSQL adapter for the editable Production timeline."""

from audio_studio.infrastructure.postgres import work
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)


class PostgresTimelineRecords:
    def __init__(
        self, *, documents: ProductionDocumentRepository | None = None,
        assets: VentureAssetRepository | None = None,
    ):
        self.documents = documents or ProductionDocumentRepository()
        self.assets = assets or VentureAssetRepository()

    @staticmethod
    def production(production_id: int) -> dict | None:
        return work.production_get(production_id)

    def part(self, production_id: int, part_id: int) -> dict | None:
        return self.documents.part(production_id, part_id)

    def reorder(self, production_id: int, order: list[int]) -> bool:
        return self.documents.reorder(production_id, order)

    def set_enabled(
        self, production_id: int, part_id: int, enabled: bool,
    ) -> bool:
        return self.documents.set_enabled(production_id, part_id, enabled)

    def create_part(
        self, production_id: int, values: dict,
        before_part_public_id: str | None = None,
    ) -> int | None:
        return self.documents.create_part(
            production_id, values, before_part_public_id)

    def import_parts(
        self, production_id: int, items: list[dict],
        voice_identity_ids: set[str],
        exact_routes: list[dict] | None = None,
    ) -> dict | None:
        return self.documents.import_parts(
            production_id, items, voice_identity_ids, exact_routes)

    def asset(self, asset_id: int) -> dict | None:
        return self.assets.get(asset_id)

    def asset_allowed(
        self, production_id: int, asset_id: int,
    ) -> bool:
        return self.assets.allowed_for_production(production_id, asset_id)

    def insert_asset(
        self, production_id: int, asset_id: int,
        before_part_public_id: str | None = None,
    ) -> int | None:
        return self.documents.insert_asset(
            production_id, asset_id, before_part_public_id)

    def replace_asset(
        self, production_id: int, part_id: int, asset_id: int,
    ) -> bool:
        return self.documents.replace_asset(production_id, part_id, asset_id)

    def duplicate(
        self, production_id: int, part_id: int, filename: str,
    ) -> int | None:
        return self.documents.duplicate(production_id, part_id, filename)

    def delete(self, production_id: int, ids: list[int]) -> list[str] | None:
        return self.documents.delete(production_id, ids)

    def move(
        self, source_production_id: int, ids: list[int],
        destination_production_id: int,
    ) -> bool:
        return self.documents.move(
            source_production_id, ids, destination_production_id)

    def save_script(self, production_id: int, part_id: int, script: str,
                    values: dict | None = None) -> bool:
        return self.documents.save_script(
            production_id, part_id, script, values)

    def save_editorial(self, production_id: int, part_id: int,
                       expected_revision: int, values: dict) -> dict | None:
        return self.documents.save_editorial(
            production_id, part_id, expected_revision, values)

    def save_draft(self, production_id: int, part_id: int,
                   values: dict) -> bool:
        return self.documents.save_draft(production_id, part_id, values)
