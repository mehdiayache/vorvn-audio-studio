"""PostgreSQL records written by canonical Workspace upload use cases."""

from __future__ import annotations

import psycopg

from origins.domain.files import StoredFileVersion
from origins.domain.uploads import FileCategory
from origins.infrastructure.postgres.files import FileRepository
from origins.infrastructure.postgres.workspaces import WorkspaceRepository
from origins.infrastructure.postgres.voice_packages import VoicePackageRepository


class PostgresUploadRecords:
    def __init__(self, *, voices: VoicePackageRepository | None = None,
                 files: FileRepository | None = None):
        self.voices = voices or VoicePackageRepository()
        self.files = files or FileRepository()
        self.workspaces = WorkspaceRepository()

    def create_voice_reference(self, **values) -> str:
        return self.voices.create_reference(**values)

    def workspace(self, workspace_id: int) -> dict | None:
        return self.workspaces.workspace(workspace_id)

    @staticmethod
    def _stored_values(stored: StoredFileVersion) -> dict:
        return {
            "filename": stored.filename, "path": stored.path,
            "duration_ms": stored.duration_ms,
            "audio_format": stored.audio_format,
            "mime_type": stored.mime_type,
            "sample_rate": stored.sample_rate, "channels": stored.channels,
            "media_type": stored.family, "media_format": stored.media_format,
            "width": stored.width, "height": stored.height,
            "video_codec": stored.video_codec, "frame_rate": stored.frame_rate,
            "version_metadata": stored.metadata or {},
        }

    def create_workspace_file(
        self, workspace_id: int, *, name: str, stored: StoredFileVersion,
        size_bytes: int, category: FileCategory | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, folder_id: int | None = None,
    ) -> dict | None:
        try:
            return self.files.create_workspace_file(
                workspace_id, name=name, size_bytes=size_bytes,
                category=category, tags=tags,
                metadata=metadata or {}, folder_id=folder_id,
                **self._stored_values(stored))
        except psycopg.OperationalError as exc:
            raise RuntimeError("The database could not save that File.") from exc

    def create_imported_workspace_file(
        self, workspace_id: int, *, provider_id: str, external_id: str,
        name: str, stored: StoredFileVersion, size_bytes: int,
        category: FileCategory | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, folder_id: int | None = None,
    ) -> tuple[dict | None, bool]:
        return self.files.create_imported_workspace_file(
            workspace_id, provider_id=provider_id, external_id=external_id,
            name=name,
            size_bytes=size_bytes, category=category, tags=tags,
            metadata=metadata or {}, folder_id=folder_id,
            **self._stored_values(stored))

    def create_generated_workspace_file(
        self, workspace_id: int, *, candidate_id: str,
        name: str, stored: StoredFileVersion, size_bytes: int,
        category: FileCategory | None = None,
        tags: tuple[str, ...] = (),
        metadata: dict | None = None, folder_id: int | None = None,
    ) -> tuple[dict | None, bool]:
        return self.files.create_generated_workspace_file(
            workspace_id, candidate_id=candidate_id, name=name,
            size_bytes=size_bytes, category=category, tags=tags,
            metadata=metadata or {}, folder_id=folder_id,
            **self._stored_values(stored))

    def generated_workspace_file(self, *, workspace_id: int,
                                 candidate_id: str) -> dict | None:
        return self.files.generated_workspace_file(
            workspace_id=workspace_id, candidate_id=candidate_id)

    def imported_file(self, *, workspace_id: int, provider_id: str,
                      external_id: str) -> dict | None:
        return self.files.imported_file(
            workspace_id=workspace_id, provider_id=provider_id,
            external_id=external_id)

    def update_file_details(
        self, file_id: int, *, name: str,
        category: FileCategory | None,
        tags: tuple[str, ...],
    ) -> dict | None:
        return self.files.update_details(
            file_id, name=name, category=category, tags=tags)
