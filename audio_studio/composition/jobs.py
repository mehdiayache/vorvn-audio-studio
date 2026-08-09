"""Concrete durable Job assembly shared by API and worker processes."""

from audio_studio.application.jobs import JobService
from audio_studio.infrastructure.postgres.jobs import JobRepository


job_service = JobService(JobRepository())
