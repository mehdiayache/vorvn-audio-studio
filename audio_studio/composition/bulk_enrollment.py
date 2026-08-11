"""Composition root for explicit Voice Library enrollment campaigns."""

from audio_studio.application.bulk_enrollment import BulkEnrollmentService
from audio_studio.infrastructure.postgres.bulk_enrollment import BulkEnrollmentRepository


bulk_enrollment_service = BulkEnrollmentService(BulkEnrollmentRepository())
