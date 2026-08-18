"""Concrete Sound Scene service assembly."""

from audio_studio.application.sound_scenes import SoundSceneService
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.sound_scenes import (
    SoundSceneRepository,
)
from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


sound_scene_service = SoundSceneService(
    records=SoundSceneRepository(),
    sequence=ProductionDocumentRepository(),
    workspace=FFmpegRenderWorkspace(),
)
