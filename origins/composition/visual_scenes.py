"""Concrete Visual Scene service assembly."""

from origins.application.visual_scenes import VisualSceneService
from origins.infrastructure.postgres.visual_scenes import (
    VisualSceneRepository,
)


visual_scene_service = VisualSceneService(records=VisualSceneRepository())
