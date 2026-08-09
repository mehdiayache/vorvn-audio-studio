"""Concrete operational service assembly for Activity and System health."""

from audio_studio.application.activity import ActivityService
from audio_studio.application.system import SystemService
from audio_studio.infrastructure.postgres.activity import ActivityRepository
from audio_studio.infrastructure.postgres.control_plane import ControlPlaneRepository
from audio_studio.infrastructure.postgres.worker_runtime import WorkerRuntimeRepository


activity_service = ActivityService(ActivityRepository())
system_service = SystemService(
    database=ControlPlaneRepository(), worker=WorkerRuntimeRepository())
