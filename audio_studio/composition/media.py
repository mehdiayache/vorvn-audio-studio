"""Concrete media delivery service assembly."""

from audio_studio.application.media import MediaService, VoiceReferenceMediaService
from audio_studio.infrastructure.audio_peaks import peaks_for_path
from audio_studio.infrastructure.media_workspace import LocalMediaWorkspace
from audio_studio.infrastructure.postgres.media_records import PostgresMediaRecords
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace


media_service = MediaService(
    workspace=LocalMediaWorkspace(),
    records=PostgresMediaRecords(),
)

voice_reference_media_service = VoiceReferenceMediaService(
    records=VoicePackageRepository(),
    workspace=VoiceReferenceWorkspace(),
    peak_reader=peaks_for_path,
)
