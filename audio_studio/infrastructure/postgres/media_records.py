"""PostgreSQL identity lookup for public media delivery."""

from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.media import MediaLookupRepository


class PostgresMediaRecords:
    def __init__(
        self, *, exports: ProductionExportRepository | None = None,
        media: MediaLookupRepository | None = None,
    ):
        self.exports = exports or ProductionExportRepository()
        self.media = media or MediaLookupRepository()

    def export(self, export_id: int) -> dict | None:
        return self.exports.get(export_id)

    def clip(self, clip_id: int) -> dict | None:
        return self.media.clip(clip_id)
