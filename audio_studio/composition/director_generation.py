"""Director generation composition shared by API and worker."""

from audio_studio.application.director_generation import DirectorGenerationService
from audio_studio.composition.jobs import job_service
from audio_studio.infrastructure.postgres.venture_assets import VentureAssetRepository


director_generation_service = DirectorGenerationService(
    job_service, VentureAssetRepository())

