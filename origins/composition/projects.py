"""Concrete Project service assembly."""

from origins.application.projects import ProjectService
from origins.infrastructure.postgres.projects import ProjectRepository


project_service = ProjectService(ProjectRepository())
