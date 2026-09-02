"""Concrete operational service assembly for Activity and System health."""

from origins.application.activity import ActivityService
from origins.application.system import SystemService
from origins.infrastructure.postgres.activity import ActivityRepository
from origins.infrastructure.postgres.control_plane import ControlPlaneRepository
from origins.infrastructure.postgres.worker_runtime import WorkerRuntimeRepository


activity_service = ActivityService(ActivityRepository())
system_service = SystemService(
    database=ControlPlaneRepository(), worker=WorkerRuntimeRepository())
