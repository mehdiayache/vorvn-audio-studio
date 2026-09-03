"""Audio Production service assembly."""

from origins.application.audio_productions import AudioProductionService
from origins.infrastructure.render_workspace import FFmpegRenderWorkspace


audio_production_service = AudioProductionService(FFmpegRenderWorkspace())
