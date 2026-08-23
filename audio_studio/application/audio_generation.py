"""Generate temporary audio candidates, then Keep through canonical Assets."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import shutil
import time
from tempfile import TemporaryDirectory
from typing import Any, Callable, Protocol
from uuid import UUID

from audio_studio.application.jobs import JobProgress, JobService
from audio_studio.application.uploads import UploadService
from audio_studio.domain.jobs import Job, JobCancelled, JobFailed, JobStatus
from audio_studio.domain.uploads import AssetCategory, AssetScope
from audio_studio.providers.vorvn_audio import (
    AudioGenerationCapability,
    AudioGenerationError,
    OurStableAudioGenerator,
)


class AudioGenerator(Protocol):
    def status(self) -> dict[str, Any]: ...
    def submit(self, capability: AudioGenerationCapability, *, prompt: str,
               seconds: int, seed: int | None,
               idempotency_key: str): ...
    def job(self, provider_job_id: str) -> dict[str, Any]: ...
    def cancel(self, provider_job_id: str) -> None: ...
    def download(self, provider_job_id: str, target: Path) -> int: ...


class AudioGenerationService:
    """Own the candidate lifecycle while Assets remain owned by uploads."""

    def __init__(self, *, generator: AudioGenerator, jobs: JobService,
                 uploads: UploadService, scratch_root: Path,
                 inspect_audio: Callable[[Path], dict | None],
                 poll_interval: float = 1, timeout_seconds: float = 900,
                 sleeper=time.sleep):
        self.generator = generator
        self.jobs = jobs
        self.uploads = uploads
        self.scratch_root = scratch_root
        self.inspect_audio = inspect_audio
        self.poll_interval = poll_interval
        self.timeout_seconds = timeout_seconds
        self.sleeper = sleeper

    def status(self) -> dict[str, Any]:
        return self.generator.status()

    def enqueue(self, *, capability: AudioGenerationCapability,
                prompt: str, seconds: int, seed: int | None,
                prompt_mode: str = "expert",
                generation_brief: dict[str, Any] | None = None,
                authored_prompt: str | None = None,
                idempotency_key: str, production_id: int | None = None) \
            -> tuple[Job, bool]:
        clean_prompt = " ".join(prompt.split())
        self._validate(capability, clean_prompt, seconds, seed)
        if prompt_mode not in {"simple", "expert"}:
            raise ValueError("Choose Simple or Expert prompting.")
        payload = {
            "operation": "generate_audio",
            "capability": capability,
            "prompt": clean_prompt,
            "prompt_mode": prompt_mode,
            "generation_brief": generation_brief if prompt_mode == "simple" else None,
            "authored_prompt": (
                " ".join((authored_prompt or prompt).split())
                if prompt_mode == "expert" else None),
            "resolved_prompt": clean_prompt,
            "seconds": seconds,
            "seed": seed,
            "engine": "vorvn_audio",
            "model": "stable-sfx" if capability == "sfx" else "stable-music",
        }
        return self.jobs.enqueue(
            "audio_generate", payload,
            idempotency_key=idempotency_key,
            production_id=production_id,
            source_tool="audio-library",
            operation_label=("Generate sound effect" if capability == "sfx"
                             else "Generate music"),
        )

    @staticmethod
    def _validate(capability: str, prompt: str, seconds: int,
                  seed: int | None) -> None:
        if capability not in {"sfx", "music"}:
            raise ValueError("Choose Sound Effect or Music.")
        if not prompt:
            raise ValueError("Describe the audio you want.")
        if len(prompt) > 500:
            raise ValueError("Keep the generation prompt under 500 characters.")
        minimum, maximum = (1, 30) if capability == "sfx" else (5, 120)
        if not minimum <= seconds <= maximum:
            raise ValueError(
                f"{('Sound Effect' if capability == 'sfx' else 'Music')} "
                f"duration must be between {minimum} and {maximum} seconds.")
        if seed is not None and not 0 <= seed <= 2_147_483_647:
            raise ValueError("Seed must be between 0 and 2,147,483,647.")

    def _candidate_path(self, candidate_id: UUID) -> Path:
        return self.scratch_root / "generated" / f"{candidate_id}.wav"

    def handle_job(self, job: Job, progress: JobProgress) -> dict[str, Any]:
        capability = str(job.payload.get("capability") or "")
        prompt = str(job.payload.get("prompt") or "")
        seconds = int(job.payload.get("seconds") or 0)
        raw_seed = job.payload.get("seed")
        seed = int(raw_seed) if raw_seed is not None else None
        self._validate(capability, prompt, seconds, seed)
        provider_job_id = ""
        model_status = self.generator.status()
        try:
            progress.progress(job.id, 0, 3, "Sending generation request")
            submission = self.generator.submit(
                capability, prompt=prompt, seconds=seconds, seed=seed,
                idempotency_key=f"audio-{capability}-{job.public_id}")
            provider_job_id = submission.job_id
            started = time.monotonic()
            provider_state: dict[str, Any] = {}
            while True:
                progress.progress(
                    job.id, 1, 3,
                    "Waiting for generated audio" if provider_state.get(
                        "status") == "processing" else "Waiting in generation queue")
                provider_state = self.generator.job(provider_job_id)
                status = str(provider_state.get("status") or "")
                if status == "completed":
                    break
                if status in {"failed", "cancelled", "expired"}:
                    message = {
                        "failed": "The generator could not create this audio.",
                        "cancelled": "Audio generation was cancelled.",
                        "expired": "The generated result expired before download.",
                    }[status]
                    raise JobFailed(message, result={
                        "provider_request_id": provider_job_id,
                        "provider_status": status,
                        "failure_code": provider_state.get("failure_code"),
                    })
                if status not in {"queued", "processing", "cancelling"}:
                    raise AudioGenerationError(
                        "Audio Generation returned an unknown Job state.")
                if time.monotonic() - started >= self.timeout_seconds:
                    self.generator.cancel(provider_job_id)
                    raise AudioGenerationError("Audio generation timed out.")
                self.sleeper(self.poll_interval)

            progress.progress(job.id, 2, 3, "Downloading generated audio")
            target = self._candidate_path(job.public_id)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(".download")
            temporary.unlink(missing_ok=True)
            try:
                size_bytes = self.generator.download(
                    provider_job_id, temporary)
                inspection = self.inspect_audio(temporary)
                if inspection is None:
                    raise AudioGenerationError(
                        "The generated result did not contain valid audio.")
                temporary.replace(target)
            except Exception:
                temporary.unlink(missing_ok=True)
                target.unlink(missing_ok=True)
                raise
            model = (model_status.get("models") or {}).get(capability, {})
            resolved_seed = int(provider_state.get("seed")
                                or submission.seed)
            progress.progress(job.id, 3, 3, "Generated audio is ready")
            return {
                "candidate_id": str(job.public_id),
                "candidate_url": (
                    f"/api/v1/audio-generations/{job.public_id}/candidate"),
                "capability": capability,
                "prompt": prompt,
                "prompt_mode": job.payload.get("prompt_mode") or "expert",
                "generation_brief": job.payload.get("generation_brief"),
                "authored_prompt": job.payload.get("authored_prompt"),
                "resolved_prompt": (
                    job.payload.get("resolved_prompt") or prompt),
                "seconds": seconds,
                "seed": resolved_seed,
                "provider_request_id": provider_job_id,
                "provider_status": "completed",
                "provider_endpoint": f"/v1/audio/{capability}",
                "provider_region": "EU",
                "model": model.get("id") or None,
                "generated_at": provider_state.get("completed_at")
                or datetime.now(timezone.utc).isoformat(),
                "remote_expires_at": provider_state.get("expires_at"),
                "remote_output_bytes": provider_state.get("output_bytes"),
                "remote_output_sha256": provider_state.get("output_sha256"),
                "size_bytes": size_bytes,
                "duration_ms": inspection["duration_ms"],
                "audio_format": inspection["audio_format"],
                "sample_rate": inspection["sample_rate"],
                "channels": inspection["channels"],
                "usage": {"seconds": seconds},
                "engine": "vorvn_audio",
            }
        except JobCancelled:
            if provider_job_id:
                self.generator.cancel(provider_job_id)
            raise
        except JobFailed:
            raise
        except AudioGenerationError as exc:
            raise JobFailed(str(exc), result={
                "provider_request_id": provider_job_id or None,
                "capability": capability,
            }) from exc

    def candidate(self, candidate_id: UUID) -> tuple[Job, Path]:
        job = self.jobs.get(candidate_id)
        if not job or job.kind != "audio_generate":
            raise LookupError("That generated candidate does not exist.")
        if job.status not in {JobStatus.SUCCEEDED, JobStatus.WARNING}:
            raise ValueError("That generation has not produced audio.")
        if job.result.get("candidate_id") != str(candidate_id):
            raise LookupError("That generated candidate does not exist.")
        path = self._candidate_path(candidate_id)
        if not path.is_file():
            raise LookupError(
                "That temporary generated candidate is no longer available.")
        return job, path

    def discard(self, candidate_id: UUID) -> bool:
        job = self.jobs.get(candidate_id)
        if not job or job.kind != "audio_generate":
            raise LookupError("That generated candidate does not exist.")
        path = self._candidate_path(candidate_id)
        existed = path.is_file()
        path.unlink(missing_ok=True)
        return existed

    def recent(self, production_id: int, *, limit: int = 8) -> list[dict]:
        """Return durable generation attempts with their current candidate truth."""
        history = []
        for job in self.jobs.recent_for_production(
                production_id, kind="audio_generate", limit=limit):
            candidate_id = str(job.public_id)
            kept_asset = self.uploads.generated_asset(
                candidate_id=candidate_id)
            candidate_available = (
                job.status in {JobStatus.SUCCEEDED, JobStatus.WARNING}
                and self._candidate_path(job.public_id).is_file())
            history.append({
                "job_id": candidate_id,
                "status": str(job.status),
                "progress": job.progress,
                "detail": job.detail,
                "error": job.error or None,
                "created_at": (job.created_at.isoformat()
                               if job.created_at else None),
                "request": {
                    "capability": job.payload.get("capability"),
                    "prompt_mode": job.payload.get("prompt_mode") or "expert",
                    "generation_brief": job.payload.get("generation_brief"),
                    "authored_prompt": job.payload.get("authored_prompt"),
                    "resolved_prompt": (
                        job.payload.get("resolved_prompt")
                        or job.payload.get("prompt")),
                    "seconds": job.payload.get("seconds"),
                    "seed": job.payload.get("seed"),
                },
                "candidate": job.result if candidate_available else None,
                "candidate_available": candidate_available,
                "kept_asset": kept_asset,
            })
        return history

    def keep(self, *, candidate_id: UUID, collection_id: int, name: str,
             category: AssetCategory, scope: AssetScope,
             tags: tuple[str, ...]) -> dict:
        existing = self.uploads.generated_asset(
            candidate_id=str(candidate_id))
        if existing:
            self._candidate_path(candidate_id).unlink(missing_ok=True)
            return {"asset": existing, "duplicate": True}
        try:
            job, source = self.candidate(candidate_id)
        except LookupError:
            # A concurrent Keep may have committed and removed the temporary
            # candidate after our first lookup. Resolve that canonical winner.
            existing = self.uploads.generated_asset(
                candidate_id=str(candidate_id))
            if existing:
                return {"asset": existing, "duplicate": True}
            raise
        provenance = {
            "origin": "generated",
            "provider": "vorvn-audio",
            "service": "ai.vrn.one",
            "capability": job.result.get("capability"),
            "model": job.result.get("model"),
            "route": job.result.get("provider_endpoint"),
            "prompt_mode": job.result.get("prompt_mode") or "expert",
            "generation_brief": job.result.get("generation_brief"),
            "authored_prompt": job.result.get("authored_prompt"),
            "resolved_prompt": (job.result.get("resolved_prompt")
                                or job.result.get("prompt")),
            "parameters": {
                "seconds": job.result.get("seconds"),
                "seed": job.result.get("seed"),
            },
            "seed": job.result.get("seed"),
            "external_id": str(candidate_id),
            "provider_job_id": job.result.get("provider_request_id"),
            "generated_at": job.result.get("generated_at"),
            "output_duration_ms": job.result.get("duration_ms"),
            "remote_output_bytes": job.result.get("remote_output_bytes"),
            "remote_output_sha256": job.result.get("remote_output_sha256"),
        }
        details = self.uploads.prepare_asset_upload(
            f"generated-{candidate_id}.wav", name=name,
            category=category, scope=scope, supplied_tags=tags,
            metadata=provenance)
        self.scratch_root.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(
                prefix="generated-keep-", dir=self.scratch_root) as directory:
            copy = Path(directory) / "candidate.wav"
            try:
                shutil.copy2(source, copy)
            except FileNotFoundError:
                existing = self.uploads.generated_asset(
                    candidate_id=str(candidate_id))
                if existing:
                    return {"asset": existing, "duplicate": True}
                raise LookupError(
                    "That temporary generated candidate is no longer available.")
            result = self.uploads.save_generated_asset_file(
                collection_id, copy, copy.stat().st_size,
                candidate_id=str(candidate_id), details=details)
        source.unlink(missing_ok=True)
        return result


def create_audio_generation_service(
        *, generator: AudioGenerator | None = None, jobs: JobService,
        uploads: UploadService, scratch_root: Path,
        inspect_audio: Callable[[Path], dict | None],
        poll_interval: float = 1, timeout_seconds: float = 900,
        sleeper=time.sleep) -> AudioGenerationService:
    return AudioGenerationService(
        generator=generator or OurStableAudioGenerator(), jobs=jobs,
        uploads=uploads, scratch_root=scratch_root,
        inspect_audio=inspect_audio,
        poll_interval=poll_interval, timeout_seconds=timeout_seconds,
        sleeper=sleeper)
