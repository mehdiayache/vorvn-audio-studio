"""Audio Project service assembly."""

from audio_studio.application.audio_projects import AudioProjectService
from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


audio_project_service = AudioProjectService(FFmpegRenderWorkspace())
