"""Media generation composition shared by API and worker."""

from origins.application.media_generation import MediaGenerationService
from origins.application.media_generation_execution import (
    MediaGenerationHandler,
)
from origins.application.provider_operations import ProviderOperationService
from origins.composition.jobs import job_service
from origins.composition.uploads import upload_service
from origins.config import settings
from origins.domain.media_models import models
from origins.infrastructure.media_inputs import MediaInputMaterializer
from origins.infrastructure.postgres.files import FileRepository
from origins.infrastructure.postgres.provider_operations import (
    ProviderOperationRepository,
)
from origins.providers.kie.models import KieModelAdapter
from origins.providers.kie.provider import KieMediaGenerationProvider


media_file_repository = FileRepository()
media_generation_service = MediaGenerationService(
    job_service, media_file_repository)
model_adapter_types = {"kie-kling-omni": KieModelAdapter()}
media_generation_handler = MediaGenerationHandler(
    providers={"kie": KieMediaGenerationProvider()},
    model_adapters={
        model["id"]: model_adapter_types[model["adapter_key"]]
        for model in models()
    },
    files=media_file_repository,
    uploads=upload_service,
    materializer=MediaInputMaterializer(),
    operations=ProviderOperationService(ProviderOperationRepository()),
    scratch_root=settings.root / ".incoming",
)
