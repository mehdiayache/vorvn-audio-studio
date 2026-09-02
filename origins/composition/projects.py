"""Concrete Work hierarchy service assembly."""

from origins.application.projects import ProjectService
from origins.infrastructure.postgres.project_service import PostgresProjectRecords
from origins.infrastructure.timeline_workspace import LocalTimelineWorkspace


project_service = ProjectService(PostgresProjectRecords(), LocalTimelineWorkspace())
