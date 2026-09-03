"""Concrete Production render service assembly."""

from origins.application.renders import RenderService
from origins.infrastructure.postgres.renders import PostgresRenderRecords
from origins.infrastructure.render_workspace import FFmpegRenderWorkspace


render_service = RenderService(
    records=PostgresRenderRecords(),
    workspace=FFmpegRenderWorkspace(),
)
