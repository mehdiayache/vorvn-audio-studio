"""Native speech generation use case for create, Take, and Draft operations."""

from __future__ import annotations

import hashlib
from typing import Any, Callable, Protocol
from urllib.parse import quote

from audio_studio.domain.jobs import Job, JobFailed
from audio_studio.domain.speech import (
    PreparedSpeech,
    SpeechSynthesisError,
    StoredAudio,
    SynthesizedSpeech,
)
from audio_studio.application.provider_operations import ProviderOperationService


PLAUSIBLE_CHARACTERS_PER_SECOND = 25
_SETTING_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "binding_id", "catalogue_voice_id",
    "capability_id", "cast_role_id", "engine", "model", "format", "language",
    "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
)


class SpeechRepository(Protocol):
    def voice_bindings(self) -> list[dict]: ...
    def catalogue_voices(self) -> list[dict]: ...
    def pronunciations(self) -> list[dict]: ...
    def today_spend(self) -> float: ...
    def production(self, production_id: int) -> dict | None: ...
    def part(self, part_id: int, production_id: int) -> dict | None: ...
    def cast_assignment(self, production_id: int, role_id: str,
                        *, voice_identity_id: str | None,
                        catalogue_voice_id: str | None) -> dict: ...
    def create_part(self, production_id: int | None, insert_at: int | None,
                    values: dict[str, Any]) -> int | None: ...
    def replace_part(self, part_id: int, production_id: int,
                     expected_revision: int, values: dict[str, Any], *,
                     operation: str) -> dict[str, int]: ...


class SpeechProvider(Protocol):
    def is_configured(self) -> bool: ...
    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                catalogue: list[dict],
                pronunciations: list[dict], preferences: dict
                ) -> PreparedSpeech: ...
    def synthesize(self, prepared: PreparedSpeech,
                   on_progress=None) -> SynthesizedSpeech: ...


class SpeechWorkspace(Protocol):
    def save(self, audio: bytes, extension: str) -> StoredAudio: ...


def _defaults(values: dict) -> dict:
    return {
        "text": "", "text_raw": None, "text_shaped": None,
        "text_tagged": None, "text_state": "raw", "voice": "",
        "voice_identity_id": None, "binding_id": None,
        "catalogue_voice_id": None, "capability_id": None, "cast_role_id": None,
        "engine": "audio", "model": "plus",
        "format": "mp3", "language": "Auto", "instruction": "",
        "speech_mode": "exact", "rate": 1, "pitch": 1, "volume": 50,
        "seed": 0, **values,
    }


def _truncation_warning(prepared: PreparedSpeech,
                        duration_ms: int | None) -> str | None:
    compared = prepared.spoken_text
    if not duration_ms or duration_ms <= 0 or len(compared) < 25:
        return None
    speed = len(compared) / (duration_ms / 1000)
    if speed <= PLAUSIBLE_CHARACTERS_PER_SECOND:
        return None
    detail = f"{duration_ms / 1000:.1f}s of audio for {len(compared)} characters"
    if prepared.language:
        return (f"This voice may not support {prepared.language} — {detail}. "
                "Listen before using this Take or choose another voice.")
    return f"The model may have stopped early — {detail}. Listen before using this Take."


def _fidelity_warning(result: SynthesizedSpeech) -> str | None:
    if result.fidelity.get("status") in {"warning", "failed", "unverified"}:
        return str(result.fidelity.get("message") or "Review the returned script.")
    return None


def _record(prepared: PreparedSpeech, result: SynthesizedSpeech,
            saved: StoredAudio, values: dict) -> dict[str, Any]:
    return {
        "text": prepared.original_text,
        "text_raw": values.get("text_raw"),
        "text_shaped": values.get("text_shaped"),
        "text_tagged": values.get("text_tagged"),
        "text_state": values.get("text_state") or "raw",
        "voice": prepared.voice,
        "voice_name": prepared.voice_name,
        "voice_identity_id": prepared.voice_identity_id,
        "engine": prepared.engine, "model": prepared.tier,
        "format": prepared.output_format, "language": prepared.language,
        "instruction": prepared.instruction,
        "speech_mode": prepared.speech_mode,
        "rate": prepared.rate, "pitch": prepared.pitch,
        "volume": prepared.volume, "seed": prepared.seed,
        "filename": saved.filename, "path": saved.path,
        "size_bytes": saved.size_bytes, "duration_ms": saved.duration_ms,
        "chars": len(prepared.original_text),
        "requests": len(result.diagnostics) or prepared.request_count,
        "cost": round(float(result.cost), 6),
        "kind": "audio", "title": values.get("title"),
        "usage": result.usage, "cost_basis": result.cost_basis,
        "provider_text": result.returned_text,
        "fidelity": result.fidelity, "failures": result.failures,
        "binding_id": prepared.binding_id,
        "catalogue_voice_id": prepared.catalogue_voice_id,
        "reference_id": prepared.reference_id,
        "capability_id": prepared.capability_id,
        "capability_name": prepared.capability_name,
        "provider": prepared.provider or "alibaba",
        "provider_region": prepared.provider_region or result.provider_region,
        "provider_voice_id": prepared.voice,
        "model_id": prepared.model_id,
        "tier": prepared.tier,
        "segmentation": {"requests": prepared.request_count},
        "cast_role_id": values.get("cast_role_id"),
        "_cast_snapshot": values.get("_cast_snapshot") or {},
        "diagnostics": {"provider": result.diagnostics,
                        "request_ids": result.request_ids,
                        "fidelity": result.fidelity,
                        "failures": result.failures},
    }


class SpeechGenerationService:
    def __init__(self, repository: SpeechRepository, provider: SpeechProvider,
                 workspace: SpeechWorkspace, preferences: Callable[[], dict],
                 operations: ProviderOperationService | None = None):
        self.repository = repository
        self.provider = provider
        self.workspace = workspace
        self.preferences = preferences
        self.operations = operations

    def run(self, values: dict, on_progress=None) -> dict[str, Any]:
        operation = str(values.get("operation") or "create")
        production_id = values.get("production_id")
        production_id = int(production_id) if production_id is not None else None
        part_id = values.get("part_id")
        part_id = int(part_id) if part_id is not None else None
        part = None
        if operation == "create":
            production = (self.repository.production(production_id)
                          if production_id is not None else None)
            if production_id is not None and not production:
                raise LookupError("That Production no longer exists.")
            inherited = production.get("settings", {}) if production else {}
            overrides = {key: value for key, value in values.items()
                         if key in _SETTING_FIELDS or key == "title"}
            effective = _defaults({**inherited, **overrides})
        else:
            if production_id is None or part_id is None:
                raise ValueError("A Production and Part are required.")
            part = self.repository.part(part_id, production_id)
            if not part:
                raise LookupError("That Part no longer belongs to this Production.")
            if operation == "render_draft" and part.get("kind") != "draft":
                raise ValueError("That Draft has already been recorded.")
            if operation == "record_part" and (
                    part.get("kind") != "speech" or
                    part.get("selected_take_id") is not None):
                raise ValueError("That pending speech Part has already been recorded.")
            if operation == "regenerate" and part.get("kind") not in {"audio", "speech"}:
                raise ValueError("Only recorded speech can receive another Take.")
            inherited = {key: part.get(key) for key in _SETTING_FIELDS}
            inherited["title"] = part.get("title")
            overrides = {key: value for key, value in values.items()
                         if key in _SETTING_FIELDS or key == "title"}
            effective = _defaults({**inherited, **overrides})
            # The submitted text belongs to this composition attempt.  It is
            # intentionally allowed to differ from the Part's canonical
            # script; only an explicit Part edit may change that script and
            # increment its revision.

        text = str(effective.get("text") or "").strip()
        if not text:
            raise ValueError("Write something before generating speech.")
        if not self.provider.is_configured():
            raise RuntimeError("Add the Alibaba API key in Settings before generating.")
        preferences = self.preferences()
        prepared = self.provider.prepare(
            text=text, values=effective,
            bindings=self.repository.voice_bindings(),
            catalogue=self.repository.catalogue_voices(),
            pronunciations=self.repository.pronunciations(),
            preferences=preferences,
        )
        cast_role_id = str(effective.get("cast_role_id") or "").strip()
        if production_id is not None and cast_role_id:
            effective["_cast_snapshot"] = self.repository.cast_assignment(
                production_id, cast_role_id,
                voice_identity_id=prepared.voice_identity_id,
                catalogue_voice_id=prepared.catalogue_voice_id)

        estimate = prepared.estimated_cost
        job_id = int(values.get("_job_id") or 0)
        reservation_id = None
        attempt_id = None
        warning_limit = float(preferences.get("warn_above") or 0)
        if warning_limit > 0 and estimate > warning_limit \
                and not bool(values.get("confirmed")):
            return {
                "needs_confirmation": True, "estimate": estimate,
                "estimated_cost": estimate, "cost": 0,
                "chars": len(prepared.spoken_text), "model": prepared.model_id,
                "engine": prepared.engine, "voice": prepared.voice,
            }
        if self.operations and job_id:
            reservation_id = self.operations.authorize(
                job_id, "speech", estimate, preferences,
                bool(values.get("confirmed")))
            attempt_id = self.operations.repository.begin_attempt(
                job_id, "speech", prepared.voice_route,
                {"text_hash": hashlib.sha256(
                    prepared.spoken_text.encode("utf-8")).hexdigest(),
                 "language": prepared.language, "format": prepared.output_format,
                 "delivery": {"instruction": prepared.instruction,
                              "rate": prepared.rate, "pitch": prepared.pitch,
                              "volume": prepared.volume}},
                reservation_id)

        if on_progress:
            on_progress(0, max(1, prepared.request_count), "Preparing speech")
        try:
            if attempt_id:
                self.operations.repository.mark_sent(attempt_id)
            made = self.provider.synthesize(
                prepared,
                on_progress=(lambda done, total, detail: on_progress(
                    max(0, int(done) - 1), max(1, int(total)), str(detail)[:300]))
                if on_progress else None,
            )
        except SpeechSynthesisError as exc:
            evidence = {
                **exc.result,
                "chars": len(prepared.spoken_text),
                "estimated_cost": estimate,
                "model": prepared.model_id,
                "engine": prepared.engine,
                "voice": prepared.voice,
                "voice_identity_id": prepared.voice_identity_id,
                "voice_route": prepared.voice_route,
                "provider_attempt_id": attempt_id,
            }
            if attempt_id:
                status = self.operations.failure_status(exc)
                cost = float(evidence.get("cost") or (
                    estimate if status == "ambiguous" else 0))
                self.operations.repository.finish_attempt(
                    attempt_id, status, cost=cost,
                    usage=evidence.get("usage") or {},
                    request_ids=evidence.get("request_ids") or [],
                    error={"message": str(exc)})
                evidence["ambiguous"] = status == "ambiguous"
            raise JobFailed(str(exc), evidence) from exc
        except Exception as exc:
            if attempt_id:
                self.operations.repository.finish_attempt(
                    attempt_id, "ambiguous", cost=estimate, usage={},
                    request_ids=[], error={"message": str(exc),
                                           "type": type(exc).__name__})
            raise JobFailed(
                "The provider response was lost after the paid request was sent. "
                "Review this ambiguous attempt before retrying.",
                {"provider_attempt_id": attempt_id, "ambiguous": True,
                 "requires_review": True,
                 "estimated_cost": estimate}) from exc
        if not made.audio:
            if attempt_id:
                self.operations.repository.finish_attempt(
                    attempt_id, "definitive_failed", cost=float(made.cost or 0),
                    usage=made.usage, request_ids=made.request_ids,
                    error={"message": "Provider returned no audio."})
            raise JobFailed("Alibaba returned no audio.", {
                "provider_attempt_id": attempt_id, "cost": float(made.cost or 0),
                "usage": made.usage, "request_ids": made.request_ids,
            })
        if made.failures:
            if attempt_id:
                self.operations.repository.finish_attempt(
                    attempt_id, "definitive_failed", cost=float(made.cost or 0),
                    usage=made.usage, request_ids=made.request_ids,
                    error={"message": "Provider returned incomplete speech.",
                           "failures": made.failures})
            raise JobFailed(
                "The provider could not complete every speech section. "
                "No incomplete recording was saved.",
                {
                    "failures": made.failures,
                    "usage": made.usage,
                    "cost": made.cost,
                    "cost_basis": made.cost_basis,
                    "model": prepared.model_id,
                    "engine": prepared.engine,
                    "voice": prepared.voice,
                    "request_ids": made.request_ids,
                    "provider_diagnostics": made.diagnostics,
                    "provider_attempt_id": attempt_id,
                },
            )
        if attempt_id:
            self.operations.repository.finish_attempt(
                attempt_id, "succeeded", cost=float(made.cost or 0),
                usage=made.usage, request_ids=made.request_ids, error={},
                receipt={
                    "audio_sha256": hashlib.sha256(made.audio).hexdigest(),
                    "size_bytes": len(made.audio),
                    "format": prepared.output_format,
                    "returned_text": made.returned_text,
                    "fidelity": made.fidelity,
                    "provider_region": made.provider_region,
                    "provider_endpoint": made.provider_endpoint,
                })
        try:
            saved = self.workspace.save(made.audio, prepared.extension)
        except Exception as exc:
            raise JobFailed(
                "The provider completed and may have billed this recording, "
                "but Audio Studio could not retain the audio locally. Provider "
                "evidence was preserved; an operator must decide whether to "
                "make a new paid attempt.",
                {"provider_attempt_id": attempt_id,
                 "provider_succeeded": True,
                 "requires_review": True,
                 "cost": float(made.cost or 0), "usage": made.usage,
                 "cost_basis": made.cost_basis,
                 "price_version": made.price_version,
                 "provider_region": made.provider_region,
                 "provider_endpoint": made.provider_endpoint,
                 "request_ids": made.request_ids,
                 "model": prepared.model_id, "engine": prepared.engine,
                 "voice": prepared.voice}) from exc
        if attempt_id:
            self.operations.repository.record_artifact(attempt_id, {
                "type": "audio", "filename": saved.filename,
                "path": saved.path, "size_bytes": saved.size_bytes,
                "duration_ms": saved.duration_ms,
            })
        row = _record(prepared, made, saved, effective)
        row["provider_attempt_id"] = int(attempt_id) if attempt_id else None
        row["_source_script_hash"] = values.get("_source_script_hash")
        # Selection is an operation command, not a provider setting. Preserve
        # the explicit caller contract across the provider/persistence seam so
        # Generate Alternative can create a Take without silently promoting it.
        row["select_result"] = bool(values.get("select_result", True))
        mutation: dict[str, int] = {}
        try:
            if operation == "create":
                created_part_id = self.repository.create_part(
                    production_id, values.get("insert_at"), row)
                if production_id is not None and created_part_id:
                    created_part = self.repository.part(
                        created_part_id, production_id)
                    if created_part and created_part.get("selected_take_id"):
                        mutation["take_id"] = int(created_part["selected_take_id"])
                    elif created_part and cast_role_id:
                        mutation["cast_changed"] = 1
            else:
                assert (part is not None and part_id is not None
                        and production_id is not None)
                created_part_id = part_id
                mutation = self.repository.replace_part(
                    part_id, production_id,
                    int(values.get("_source_part_revision") or part["revision"]),
                    row,
                    operation=operation)
        except Exception as exc:
            raise JobFailed(
                "The provider completed and the audio was saved, but Audio "
                "Studio could not create its Take. The saved provider result "
                "must be recovered instead of synthesized again.",
                {"provider_attempt_id": attempt_id,
                 "provider_succeeded": True,
                 "requires_review": True,
                 "cost": float(made.cost or 0), "usage": made.usage,
                 "cost_basis": made.cost_basis,
                 "price_version": made.price_version,
                 "provider_region": made.provider_region,
                 "provider_endpoint": made.provider_endpoint,
                 "request_ids": made.request_ids,
                 "saved_audio": {"filename": saved.filename,
                                 "path": saved.path,
                                 "size_bytes": saved.size_bytes,
                                 "duration_ms": saved.duration_ms},
                 "model": prepared.model_id, "engine": prepared.engine,
                 "voice": prepared.voice}) from exc
        if on_progress:
            on_progress(max(1, prepared.request_count),
                        max(1, prepared.request_count), "Speech ready")

        warning = ("Alternative Take created without changing or selecting the Part."
                   if mutation.get("selected") == 0
                   and not bool(values.get("select_result", True)) else
                   "The Part changed while this Take was generating. The "
                   "historical Take was kept but not selected."
                   if mutation.get("selected") == 0 else
                   "The Cast changed while this Take was generating. The "
                   "historical Take was kept but not selected."
                   if mutation.get("cast_changed") else
                   _fidelity_warning(made) or _truncation_warning(
                       prepared, saved.duration_ms))
        request_ids = list(made.request_ids)
        return {
            "id": created_part_id,
            "part_id": created_part_id,
            "take_id": mutation.get("take_id"),
            "url": f"/audio/{quote(saved.filename)}",
            "name": saved.filename, "path": saved.path,
            "chars": len(prepared.spoken_text),
            "requests": len(made.diagnostics) or prepared.request_count,
            "size_mb": round(saved.size_bytes / 1_000_000, 2),
            "duration_ms": saved.duration_ms,
            "cost": round(float(made.cost), 6),
            "estimated_cost": estimate, "cost_basis": made.cost_basis,
            "usage": made.usage, "failures": made.failures,
            "warning": warning, "returned_text": made.returned_text,
            "fidelity": made.fidelity, "voice_route": prepared.voice_route,
            "pronunciations": prepared.pronunciations,
            "rewrites": [{"from": before, "to": after}
                         for before, after in prepared.rewrites],
            "model": prepared.model_id, "engine": prepared.engine,
            "voice": prepared.voice,
            "voice_identity_id": prepared.voice_identity_id,
            "provider_region": made.provider_region,
            "provider_endpoint": made.provider_endpoint,
            "price_version": made.price_version,
            "provider_request_id": request_ids[0] if len(request_ids) == 1 else None,
            "request_ids": request_ids,
            "provider_diagnostics": made.diagnostics,
            "provider_attempt_id": attempt_id,
            **mutation,
        }


class SpeechJobHandler:
    def __init__(self, service: SpeechGenerationService):
        self.service = service

    def __call__(self, job: Job, repository) -> dict[str, Any]:
        return self.service.run(
            {**job.payload, "_job_id": job.id},
            on_progress=lambda done, total, detail: repository.progress(
                job.id, done, total, detail),
        )
