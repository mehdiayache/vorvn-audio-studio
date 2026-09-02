"""Concrete media delivery service assembly."""

from origins.application.media import MediaService, VoiceReferenceMediaService
from origins.infrastructure.audio_peaks import peaks_for_path
from origins.infrastructure.media_workspace import LocalMediaWorkspace
from origins.infrastructure.postgres.media_records import PostgresMediaRecords
from origins.infrastructure.postgres.voice_packages import VoicePackageRepository
from origins.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace


media_service = MediaService(
    workspace=LocalMediaWorkspace(),
    records=PostgresMediaRecords(),
)

voice_reference_media_service = VoiceReferenceMediaService(
    records=VoicePackageRepository(),
    workspace=VoiceReferenceWorkspace(),
    peak_reader=peaks_for_path,
)
