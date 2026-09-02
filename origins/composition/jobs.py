"""Concrete durable Job assembly shared by API and worker processes."""

from origins.application.jobs import JobService
from origins.infrastructure.postgres.jobs import JobRepository


job_service = JobService(JobRepository())
