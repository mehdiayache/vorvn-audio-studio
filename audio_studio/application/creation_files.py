"""Commit exact Creation outputs as canonical Space Files."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from audio_studio.domain.files import StoredFileVersion
from audio_studio.domain.jobs import Job


class CreationFileRecords(Protocol):
    def create_generated_space_file(
        self, space_id: int, *, candidate_id: str, name: str,
        stored: StoredFileVersion, size_bytes: int, category=None,
        scope: str = "space", tags: tuple[str, ...] = (),
        metadata: dict | None = None,
    ) -> tuple[dict | None, bool]: ...


class CreationFileJobs(Protocol):
    def attach_output_file(self, public_id, file_id: int) -> bool: ...


class CreationFileStorage(Protocol):
    def write_text(self, text: str, extension: str,
                   mime_type: str) -> StoredFileVersion: ...
    def discard(self, stored: StoredFileVersion) -> None: ...


class CreationFileService:
    """One commit path from an execution artifact to File/FileVersion."""

    def __init__(self, records: CreationFileRecords, jobs: CreationFileJobs,
                 storage: CreationFileStorage):
        self.records = records
        self.jobs = jobs
        self.storage = storage

    def register(
        self, job: Job, *, output_key: str, name: str,
        stored: StoredFileVersion, metadata: dict | None = None,
        tags: tuple[str, ...] = (),
    ) -> dict:
        if job.space_id is None:
            raise ValueError("Creation output Files require a Space-owned Job.")
        external_id = f"{job.public_id}:{output_key}"
        provenance = {
            "origin": "generated",
            "external_id": external_id,
            "job_id": str(job.public_id),
            "creation_action_id": job.creation_action_id,
            **(metadata or {}),
        }
        file, _duplicate = self.records.create_generated_space_file(
            job.space_id, candidate_id=external_id,
            name=" ".join(name.split())[:120] or "Untitled File",
            stored=stored, size_bytes=Path(stored.path).stat().st_size,
            tags=tags, metadata=provenance,
        )
        if not file:
            raise RuntimeError("The Creation output File could not be saved.")
        if not self.jobs.attach_output_file(job.public_id, int(file["id"])):
            raise RuntimeError("The Creation output File could not be linked to its Job.")
        return file

    def write_subtitles(
        self, job: Job, *, base_name: str, language: str | None,
        srt: str, vtt: str, metadata: dict | None = None,
    ) -> list[dict]:
        label = " ".join(base_name.split())[:90] or "Subtitles"
        if language:
            label = f"{label} · {language}"
        outputs = []
        for extension, mime_type, body in (
            ("srt", "application/x-subrip", srt),
            ("vtt", "text/vtt", vtt),
        ):
            stored = self.storage.write_text(body, extension, mime_type)
            try:
                outputs.append(self.register(
                    job, output_key=extension,
                    name=f"{label}.{extension}", stored=stored,
                    metadata={**(metadata or {}), "subtitle_format": extension},
                ))
            except Exception:
                self.storage.discard(stored)
                raise
        return outputs
