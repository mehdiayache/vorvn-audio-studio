"""Concrete Work hierarchy service assembly."""

from origins.application.productions import ProductionService
from origins.infrastructure.postgres.production_service import PostgresProductionRecords


production_service = ProductionService(PostgresProductionRecords())
