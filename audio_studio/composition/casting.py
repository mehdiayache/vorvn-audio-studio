from audio_studio.application.casting import CastService
from audio_studio.infrastructure.postgres.casting import CastRepository

cast_service = CastService(CastRepository())
