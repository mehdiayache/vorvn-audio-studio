"""Concrete Visual Scene service assembly."""

from audio_studio.application.visual_scenes import VisualSceneService
from audio_studio.infrastructure.postgres.visual_scenes import (
    VisualSceneRepository,
)


visual_scene_service = VisualSceneService(records=VisualSceneRepository())
