"""Concrete Production render service assembly."""

from audio_studio.application.renders import RenderService
from audio_studio.infrastructure.postgres.renders import PostgresRenderRecords
from audio_studio.infrastructure.render_workspace import FFmpegRenderWorkspace


render_service = RenderService(
    records=PostgresRenderRecords(),
    workspace=FFmpegRenderWorkspace(),
)
