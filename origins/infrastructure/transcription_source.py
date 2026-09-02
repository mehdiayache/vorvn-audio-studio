"""Resolve a safe playable/provider source for transcription Jobs."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import urlparse

from origins.infrastructure import object_storage as storage

from origins.domain.transcription import PreparedAudio
from origins.infrastructure.media_paths import media_root
from origins.infrastructure.postgres.transcripts import TranscriptRepository


class TranscriptionSourceResolver:
    def __init__(self, repository: TranscriptRepository):
        self.repository = repository

    def prepare(self, *, url: str, name: str, playable: str,
                duration_ms: int, part_id: int | None,
                project_id: int | None, file: str) -> PreparedAudio:
        if url.strip():
            parsed = urlparse(url.strip())
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("The uploaded audio URL is invalid.")
            return PreparedAudio(
                url.strip(), name.strip() or "audio", playable.strip() or None,
                max(0, int(duration_ms or 0)), part_id, None)

        if not part_id:
            raise ValueError("Pick one of your audio files first.")
        part = self.repository.part_source(part_id, project_id=project_id)
        if not part:
            raise LookupError("That Project audio no longer exists.")
        output = media_root()
        filename = Path(str(part.get("filename") or file or "")).name
        raw_path = str(part.get("path") or "").strip()
        target = (Path(raw_path).expanduser().resolve()
                  if raw_path else (output / filename).resolve())
        if not filename or target.parent != output or not target.is_file():
            raise LookupError("That Project audio file is unavailable.")
        if not storage.configured():
            raise RuntimeError(
                "Transcription needs reference audio storage. Set it up in Settings.")
        return PreparedAudio(
            "", filename, f"/audio/{filename}",
            max(0, int(part.get("duration_ms") or duration_ms or 0)),
            part_id, part.get("clip_id"), str(target))

    def publish(self, source: PreparedAudio) -> PreparedAudio:
        if source.url:
            return source
        if not source.local_path:
            raise RuntimeError("The transcription source is unavailable.")
        content_type = mimetypes.guess_type(source.name)[0] or "audio/mpeg"
        provider_url = storage.upload(
            source.local_path, content_type=content_type,
            kind="transcription-sources",
            object_id=f"part_{source.part_id}_clip_{source.clip_id or 'none'}",
            retention="temporary")
        return PreparedAudio(
            provider_url, source.name, source.playable, source.duration_ms,
            source.part_id, source.clip_id, source.local_path)
