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

    def music(self, production_id: int) -> dict:
        return self.documents.music(production_id)

    def set_music(self, production_id: int, values: dict) -> bool:
        return self.documents.set_music(production_id, values)

    def reorder(self, production_id: int, order: list[int]) -> bool:
        return self.documents.reorder(production_id, order)

    def create_part(
        self, production_id: int, values: dict,
        insert_at: int | None = None,
    ) -> int | None:
        return self.documents.create_part(production_id, values, insert_at)

    def asset(self, asset_id: int) -> dict | None:
        return self.assets.get(asset_id)

    def asset_context(self, asset_id: int) -> dict | None:
        return self.assets.library_context(asset_id)

    def asset_allowed(
        self, production_id: int, asset_id: int, kinds: set[str],
    ) -> bool:
        return self.assets.allowed_for_production(production_id, asset_id, kinds)

    def insert_asset(
        self, production_id: int, asset_id: int, insert_at: int | None,
    ) -> int | None:
        return self.documents.insert_asset(production_id, asset_id, insert_at)

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

    def takes(self, production_id: int, part_id: int) -> list[dict] | None:
        return self.documents.takes(production_id, part_id)

    def promote(self, production_id: int, part_id: int, take_id: int) -> bool:
        return self.documents.promote(production_id, part_id, take_id)

    def save_text(self, production_id: int, part_id: int, values: dict) -> bool:
        return self.documents.save_text(production_id, part_id, values)
