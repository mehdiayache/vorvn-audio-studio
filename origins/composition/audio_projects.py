"""Audio Project service assembly."""

from origins.application.audio_projects import AudioProjectService
from origins.infrastructure.render_workspace import FFmpegRenderWorkspace


audio_project_service = AudioProjectService(FFmpegRenderWorkspace())
