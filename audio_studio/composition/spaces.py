"""Concrete Space service assembly."""

from audio_studio.application.spaces import SpaceService
from audio_studio.infrastructure.postgres.spaces import SpaceRepository


space_service = SpaceService(SpaceRepository())
