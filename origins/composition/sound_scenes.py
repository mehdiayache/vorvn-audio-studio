"""Concrete Sound Scene service assembly."""

from origins.application.sound_scenes import SoundSceneService
from origins.infrastructure.postgres.project_document import (
    ProjectDocumentRepository,
)
from origins.infrastructure.postgres.sound_scenes import (
    SoundSceneRepository,
)
from origins.infrastructure.render_workspace import FFmpegRenderWorkspace


sound_scene_service = SoundSceneService(
    records=SoundSceneRepository(),
    sequence=ProjectDocumentRepository(),
    workspace=FFmpegRenderWorkspace(),
)
