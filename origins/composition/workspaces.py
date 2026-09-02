"""Concrete Workspace service assembly."""

from origins.application.workspaces import WorkspaceService
from origins.infrastructure.postgres.workspaces import WorkspaceRepository


workspace_service = WorkspaceService(WorkspaceRepository())
