"""Concrete Work hierarchy service assembly."""

from origins.application.productions import ProductionService
from origins.infrastructure.postgres.production_service import PostgresProductionRecords
from origins.infrastructure.timeline_workspace import LocalTimelineWorkspace


production_service = ProductionService(PostgresProductionRecords(), LocalTimelineWorkspace())
