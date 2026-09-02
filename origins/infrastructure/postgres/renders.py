"""PostgreSQL adapter for Project rendering."""

from origins.domain.rendering import FinishedExport
from origins.infrastructure.postgres import projects
from origins.infrastructure.postgres.exports import ProjectExportRepository
from origins.infrastructure.postgres.project_document import ProjectDocumentRepository
from origins.infrastructure.postgres.transcripts import TranscriptRepository
from origins.infrastructure.postgres.sound_scenes import SoundSceneRepository
from origins.infrastructure.postgres.visual_scenes import VisualSceneRepository


class PostgresRenderRecords:
    def __init__(
        self, *, documents: ProjectDocumentRepository | None = None,
        exports: ProjectExportRepository | None = None,
        transcripts: TranscriptRepository | None = None,
    ):
        self.documents = documents or ProjectDocumentRepository()
        self.exports = exports or ProjectExportRepository()
        self.transcripts = transcripts or TranscriptRepository()
        self.sound_scenes = SoundSceneRepository()
        self.visual_scenes = VisualSceneRepository()

    @staticmethod
    def project(project_id: int) -> dict | None:
        return projects.get(project_id)

    def parts(self, project_id: int) -> list[dict]:
        return self.documents.parts(project_id)

    def sound_scene(self, project_id: int) -> dict | None:
        return self.sound_scenes.get(project_id)

    def visual_scene(self, project_id: int) -> dict | None:
        return self.visual_scenes.for_render(project_id)

    def transcript(self, part_id: int) -> dict | None:
        return self.transcripts.source_for_part(part_id)

    def create_export(
        self, project_id: int, *, artifact: FinishedExport,
    ) -> dict | None:
        return self.exports.create(
            project_id, filename=artifact.filename,
            path=str(artifact.target), manifest=artifact.manifest,
            renderer=artifact.renderer, duration_ms=artifact.duration_ms,
            size_bytes=artifact.size_bytes, part_count=artifact.part_count)
