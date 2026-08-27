"""PostgreSQL adapter for Production rendering."""

from audio_studio.domain.rendering import FinishedExport
from audio_studio.infrastructure.postgres import work
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository
from audio_studio.infrastructure.postgres.production_document import ProductionDocumentRepository
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository
from audio_studio.infrastructure.postgres.sound_scenes import SoundSceneRepository
from audio_studio.infrastructure.postgres.visual_scenes import VisualSceneRepository


class PostgresRenderRecords:
    def __init__(
        self, *, documents: ProductionDocumentRepository | None = None,
        exports: ProductionExportRepository | None = None,
        transcripts: TranscriptRepository | None = None,
    ):
        self.documents = documents or ProductionDocumentRepository()
        self.exports = exports or ProductionExportRepository()
        self.transcripts = transcripts or TranscriptRepository()
        self.sound_scenes = SoundSceneRepository()
        self.visual_scenes = VisualSceneRepository()

    @staticmethod
    def production(production_id: int) -> dict | None:
        return work.production_get(production_id)

    def parts(self, production_id: int) -> list[dict]:
        return self.documents.parts(production_id)

    def sound_scene(self, production_id: int) -> dict | None:
        return self.sound_scenes.get(production_id)

    def visual_scene(self, production_id: int) -> dict | None:
        return self.visual_scenes.for_render(production_id)

    def transcript(self, part_id: int) -> dict | None:
        return self.transcripts.source_for_part(part_id)

    def create_export(
        self, production_id: int, *, artifact: FinishedExport,
    ) -> dict | None:
        return self.exports.create(
            production_id, filename=artifact.filename,
            path=str(artifact.target), manifest=artifact.manifest,
            renderer=artifact.renderer, duration_ms=artifact.duration_ms,
            size_bytes=artifact.size_bytes, part_count=artifact.part_count)
