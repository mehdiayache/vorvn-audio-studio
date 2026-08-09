"""Native speech generation use case for create, Take, and Draft operations."""

from __future__ import annotations

from typing import Any, Callable, Protocol
from urllib.parse import quote

from audio_studio.domain.jobs import Job
from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech
from audio_studio.infrastructure.audio_workspace import SavedAudio


PLAUSIBLE_CHARACTERS_PER_SECOND = 25
_SETTING_FIELDS = (
    "text", "text_raw", "text_shaped", "text_tagged", "text_state",
    "voice", "voice_identity_id", "engine", "model", "format", "language",
    "instruction", "speech_mode", "rate", "pitch", "volume", "seed",
)


class SpeechRepository(Protocol):
    def voice_bindings(self) -> list[dict]: ...
    def pronunciations(self) -> list[dict]: ...
    def today_spend(self) -> float: ...
    def production(self, production_id: int) -> dict | None: ...
    def part(self, part_id: int, production_id: int) -> dict | None: ...
    def create_part(self, production_id: int | None, insert_at: int | None,
                    values: dict[str, Any]) -> int: ...
    def replace_part(self, part_id: int, production_id: int,
                     expected_created_at, values: dict[str, Any], *,
                     operation: str) -> dict[str, int]: ...


class SpeechProvider(Protocol):
    def is_configured(self) -> bool: ...
    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                pronunciations: list[dict], preferences: dict
                ) -> PreparedSpeech: ...
    def synthesize(self, prepared: PreparedSpeech,
                   on_progress=None) -> SynthesizedSpeech: ...


class SpeechWorkspace(Protocol):
    def save(self, audio: bytes, extension: str) -> SavedAudio: ...


def _defaults(values: dict) -> dict:
    return {
        "text": "", "text_raw": None, "text_shaped": None,
        "text_tagged": None, "text_state": "raw", "voice": "",
        "voice_identity_id": None, "engine": "audio", "model": "plus",
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
            saved: SavedAudio, values: dict) -> dict[str, Any]:
    return {
        "text": prepared.original_text,
        "text_raw": values.get("text_raw"),
        "text_shaped": values.get("text_shaped"),
        "text_tagged": values.get("text_tagged"),
        "text_state": values.get("text_state") or "raw",
        "voice": prepared.voice,
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
        "requests": prepared.request_count, "cost": result.cost,
        "kind": "audio", "title": values.get("title"),
        "usage": result.usage, "cost_basis": result.cost_basis,
        "provider_text": result.returned_text,
        "fidelity": result.fidelity, "failures": result.failures,
    }


class SpeechGenerationService:
    def __init__(self, repository: SpeechRepository, provider: SpeechProvider,
                 workspace: SpeechWorkspace, preferences: Callable[[], dict]):
        self.repository = repository
        self.provider = provider
        self.workspace = workspace
        self.preferences = preferences

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
            if operation == "regenerate" and part.get("kind") not in {"audio", "speech"}:
                raise ValueError("Only recorded speech can receive another Take.")
            inherited = {key: part.get(key) for key in _SETTING_FIELDS}
            inherited["title"] = part.get("title")
            overrides = {key: value for key, value in values.items()
                         if key in _SETTING_FIELDS or key == "title"}
            effective = _defaults({**inherited, **overrides})

        text = str(effective.get("text") or "").strip()
        if not text:
            raise ValueError("Write something before generating speech.")
        if not self.provider.is_configured():
            raise RuntimeError("Add the Alibaba API key in Settings before generating.")
        preferences = self.preferences()
        prepared = self.provider.prepare(
            text=text, values=effective,
            bindings=self.repository.voice_bindings(),
            pronunciations=self.repository.pronunciations(),
            preferences=preferences,
        )

        estimate = prepared.estimated_cost
        cap = float(preferences.get("daily_cap") or 0)
        spent = self.repository.today_spend() if cap > 0 else 0.0
        if cap > 0 and spent + estimate > cap:
            raise PermissionError(
                f"Daily cap reached. You've spent ${spent:.4f} today and this "
                f"would add about ${estimate:.4f}, over your ${cap:.2f} cap.")
        warning_limit = float(preferences.get("warn_above") or 0)
        if warning_limit > 0 and estimate > warning_limit \
                and not bool(values.get("confirmed")):
            return {
                "needs_confirmation": True, "estimate": estimate,
                "estimated_cost": estimate, "cost": 0,
                "chars": len(prepared.spoken_text), "model": prepared.model_id,
                "engine": prepared.engine, "voice": prepared.voice,
            }

        if on_progress:
            on_progress(0, max(1, prepared.request_count), "Preparing speech")
        made = self.provider.synthesize(
            prepared,
            on_progress=(lambda done, total, detail: on_progress(
                max(0, int(done) - 1), max(1, int(total)), str(detail)[:300]))
            if on_progress else None,
        )
        if not made.audio:
            raise RuntimeError("Alibaba returned no audio.")
        saved = self.workspace.save(made.audio, prepared.extension)
        row = _record(prepared, made, saved, effective)
        mutation: dict[str, int] = {}
        if operation == "create":
            generation_id = self.repository.create_part(
                production_id, values.get("insert_at"), row)
        else:
            assert part is not None and part_id is not None and production_id is not None
            generation_id = part_id
            mutation = self.repository.replace_part(
                part_id, production_id, part["created_at"], row,
                operation=operation)
        if on_progress:
            on_progress(max(1, prepared.request_count),
                        max(1, prepared.request_count), "Speech ready")

        warning = _fidelity_warning(made) or _truncation_warning(
            prepared, saved.duration_ms)
        request_ids = list(made.request_ids)
        return {
            "id": generation_id,
            "url": f"/audio/{quote(saved.filename)}",
            "name": saved.filename, "path": saved.path,
            "chars": len(prepared.spoken_text),
            "requests": prepared.request_count,
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
            **mutation,
        }


class SpeechJobHandler:
    def __init__(self, service: SpeechGenerationService):
        self.service = service

    def __call__(self, job: Job, repository) -> dict[str, Any]:
        return self.service.run(
            job.payload,
            on_progress=lambda done, total, detail: repository.progress(
                job.id, done, total, detail),
        )
