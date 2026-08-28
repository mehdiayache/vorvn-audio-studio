"""Director generation composition shared by API and worker."""

from audio_studio.application.director_generation import DirectorGenerationService
from audio_studio.application.director_generation_execution import (
    DirectorGenerationHandler,
)
from audio_studio.composition.jobs import job_service
from audio_studio.composition.uploads import upload_service
from audio_studio.config import settings
from audio_studio.domain.director_models import models
from audio_studio.infrastructure.director_assets import DirectorAssetMaterializer
from audio_studio.infrastructure.postgres.venture_assets import VentureAssetRepository
from audio_studio.providers.kie.models import KieModelAdapter
from audio_studio.providers.kie.provider import KieDirectorProvider


director_assets = VentureAssetRepository()
director_generation_service = DirectorGenerationService(
    job_service, director_assets)
model_adapter_types = {"kie-kling-omni": KieModelAdapter()}
director_generation_handler = DirectorGenerationHandler(
    providers={"kie": KieDirectorProvider()},
    model_adapters={
        model["id"]: model_adapter_types[model["adapter_key"]]
        for model in models()
    },
    assets=director_assets,
    uploads=upload_service,
    materializer=DirectorAssetMaterializer(),
    scratch_root=settings.root / ".incoming",
)
