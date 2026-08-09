"""Resolve a safe playable/provider source for transcription Jobs."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import urlparse

import storage

from audio_studio.application.transcription import PreparedAudio
from audio_studio.infrastructure.media_paths import media_root
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository


class TranscriptionSourceResolver:
    def __init__(self, repository: TranscriptRepository):
        self.repository = repository

    def prepare(self, *, url: str, name: str, playable: str,
                duration_ms: int, generation_id: int | None,
                production_id: int | None, file: str) -> PreparedAudio:
        if url.strip():
            parsed = urlparse(url.strip())
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("The uploaded audio URL is invalid.")
            return PreparedAudio(
                url.strip(), name.strip() or "audio", playable.strip() or None,
                max(0, int(duration_ms or 0)), generation_id)

        if not generation_id:
            raise ValueError("Pick one of your audio files first.")
        generation = self.repository.generation_source(
            generation_id, production_id=production_id)
        if not generation:
            raise LookupError("That Production audio no longer exists.")
        output = media_root()
        filename = Path(str(generation.get("filename") or file or "")).name
        raw_path = str(generation.get("path") or "").strip()
        target = (Path(raw_path).expanduser().resolve()
                  if raw_path else (output / filename).resolve())
        if not filename or target.parent != output or not target.is_file():
            raise LookupError("That Production audio file is unavailable.")
        if not storage.configured():
            raise RuntimeError(
                "Transcription needs reference audio storage. Set it up in Settings.")
        return PreparedAudio(
            "", filename, f"/audio/{filename}",
            max(0, int(generation.get("duration_ms") or duration_ms or 0)),
            generation_id, str(target))

    def publish(self, source: PreparedAudio) -> PreparedAudio:
        if source.url:
            return source
        if not source.local_path:
            raise RuntimeError("The transcription source is unavailable.")
        content_type = mimetypes.guess_type(source.name)[0] or "audio/mpeg"
        provider_url = storage.upload(
            source.local_path, content_type=content_type,
            kind="transcription-sources",
            object_id=f"generation_{source.generation_id}",
            retention="temporary")
        return PreparedAudio(
            provider_url, source.name, source.playable, source.duration_ms,
            source.generation_id, source.local_path)
