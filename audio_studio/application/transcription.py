"""Native file transcription use case, independent of HTTP and DashScope."""

from __future__ import annotations

from typing import Callable, Protocol

from audio_studio.domain import captions
from audio_studio.domain.jobs import Job
from audio_studio.domain.provider_pricing import transcription_cost
from audio_studio.domain.transcription import (
    FUN_MODEL,
    PreparedAudio,
    ProviderTranscript,
    QWEN_MODEL,
)
from audio_studio.application.provider_operations import (
    ProviderOperationService, enforce_daily_cap,
)


class TranscriptionProvider(Protocol):
    def transcribe(self, *, url: str, language: str | None, words: bool,
                   vocabulary_id: str | None,
                   enable_itn: bool) -> ProviderTranscript: ...


class AudioSourceResolver(Protocol):
    def prepare(self, *, url: str, name: str, playable: str,
                duration_ms: int, part_id: int | None,
                production_id: int | None, file: str) -> PreparedAudio: ...
    def publish(self, source: PreparedAudio) -> PreparedAudio: ...


class TranscriptPersistence(Protocol):
    def save(self, values: dict) -> int: ...
    def finish_part(self, part_id: int, take_id: int | None,
                    duration_ms: int, transcript_id: int) -> None: ...
    def today_spend(self) -> float: ...


class TranscriptionService:
    def __init__(self, repository: TranscriptPersistence,
                 provider: TranscriptionProvider,
                 source_resolver: AudioSourceResolver,
                 preferences: Callable[[], dict],
                 operations: ProviderOperationService | None = None):
        self.repository = repository
        self.provider = provider
        self.source_resolver = source_resolver
        self.preferences = preferences
        self.operations = operations

    def transcribe(self, *, url: str = "", name: str = "", file: str = "",
                   playable: str = "", duration_ms: int = 0,
                   part_id: int | None = None, language: str = "",
                   production_id: int | None = None,
                   enable_itn: bool = False,
                   vocabulary_id: str | None = None,
                   confirmed: bool = False, source_job_id: int | None = None,
                   on_progress=None) -> dict:
        source = self.source_resolver.prepare(
            url=url, name=name, playable=playable, duration_ms=duration_ms,
            part_id=part_id, production_id=production_id, file=file)
        model = FUN_MODEL if vocabulary_id else QWEN_MODEL
        region = getattr(self.provider, "region", "intl") or "intl"
        estimate = transcription_cost(source.duration_ms, region, model)
        preferences = self.preferences()
        if not (self.operations and source_job_id):
            enforce_daily_cap(
                estimate.catalog_cost, preferences, self.repository.today_spend())
        warning = float(preferences.get("warn_above") or 0)
        if warning > 0 and estimate.catalog_cost > warning and not confirmed:
            return {"needs_confirmation": True,
                    "estimate": estimate.catalog_cost,
                    "estimated_cost": estimate.catalog_cost,
                    "model": model, "cost_basis": "estimate"}

        reservation_id = None
        attempt_id = None
        if self.operations and source_job_id:
            reservation_id = self.operations.authorize(
                source_job_id, "transcription", estimate.catalog_cost,
                preferences, confirmed)
            attempt_id = self.operations.repository.begin_attempt(
                source_job_id, "transcription", {
                    "provider": "alibaba", "region": region, "model": model,
                }, {"part_id": source.part_id, "take_id": source.take_id,
                    "duration_ms": source.duration_ms, "language": language},
                reservation_id)
        source = self.source_resolver.publish(source)
        if on_progress:
            on_progress(0, 1)
        try:
            if attempt_id:
                self.operations.repository.mark_sent(attempt_id)
            result = self.provider.transcribe(
                url=source.url, language=language or None, words=True,
                vocabulary_id=vocabulary_id, enable_itn=enable_itn)
        except Exception as exc:
            if attempt_id:
                status = self.operations.failure_status(exc)
                self.operations.repository.finish_attempt(
                    attempt_id, status, cost=0, usage={}, request_ids=[],
                    error={"type": type(exc).__name__, "message": str(exc)[:600]})
                self.operations.repository.release_budget(
                    reservation_id,
                    estimate.catalog_cost if status == "ambiguous" else 0,
                    status)
            raise
        cues = captions.build_cues(result.sentences, "standard")
        srt, vtt = captions.render_srt(cues), captions.render_vtt(cues)
        final_region = result.provider_region or region
        billed_duration = result.billed_duration_ms or result.duration_ms
        cost = transcription_cost(billed_duration, final_region, model)
        if attempt_id:
            self.operations.repository.finish_attempt(
                attempt_id, "succeeded", cost=cost.catalog_cost,
                usage=result.usage or {},
                request_ids=[result.request_id] if result.request_id else [],
                error={})
            self.operations.repository.release_budget(
                reservation_id, cost.catalog_cost, "succeeded")
        transcript_id = self.repository.save({
            "name": source.name, "source_url": source.url,
            "audio_url": source.playable, "language": language or None,
            "duration_ms": result.duration_ms, "text": result.text,
            "srt": srt, "vtt": vtt, "sentences": result.sentences,
            "part_id": source.part_id, "take_id": source.take_id,
            "translated_from": None, "source_job_id": source_job_id,
            "model": cost.model, "provider_region": cost.provider_region,
            "price_version": cost.price_version,
            "catalog_rate": cost.catalog_rate,
            "catalog_cost": cost.catalog_cost,
            "cost_basis": cost.cost_basis,
        })
        if source.part_id:
            self.repository.finish_part(
                source.part_id, source.take_id, result.duration_ms, transcript_id)
        if on_progress:
            on_progress(1, 1)
        return {
            **cost.as_dict(),
            "id": transcript_id, "file": source.name,
            "part_id": source.part_id, "take_id": source.take_id,
            "url": source.playable,
            "language": language or None, "text": result.text,
            "sentences": result.sentences,
            "srt": srt, "vtt": vtt, "cost": cost.catalog_cost,
            "estimated_cost": estimate.catalog_cost,
            "seconds": billed_duration / 1000,
            "usage": result.usage or {},
            "provider_request_id": result.request_id,
            "provider_endpoint": result.provider_endpoint,
            # Caption duration is the final timed cue, while catalogue pricing
            # uses Alibaba's billable input duration when the response has it.
            "duration_ms": result.duration_ms,
        }


class TranscriptionJobHandler:
    def __init__(self, service: TranscriptionService):
        self.service = service

    def __call__(self, job: Job, repository) -> dict:
        repository.progress(job.id, 0, 1, "Listening to the audio")
        result = self.service.transcribe(
            **{key: value for key, value in job.payload.items()
               if key in {"url", "name", "file", "playable", "duration_ms",
                          "part_id", "language", "enable_itn",
                          "vocabulary_id", "confirmed", "production_id"}},
            source_job_id=job.id,
            on_progress=lambda done, total: repository.progress(
                job.id, done, total, "Listening to the audio"),
        )
        if result.get("id"):
            result["source_job_id"] = str(job.public_id)
        return result
