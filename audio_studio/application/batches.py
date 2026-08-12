"""Batch spreadsheet intake and generation, independent of HTTP and Alibaba."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Callable, Protocol
from urllib.parse import unquote

from audio_studio.domain import batch as spreadsheet
from audio_studio.domain.jobs import Job, JobFailed
from audio_studio.domain.speech import PreparedSpeech, SynthesizedSpeech
from audio_studio.application.provider_operations import ProviderOperationService


class BatchWorkspace(Protocol):
    def parse_sheet(self, filename: str, data: bytes) -> dict: ...
    def save_sheet(self, sheet: dict) -> str: ...
    def load_sheet(self, token: str) -> dict: ...
    def create_output(self, token: str, run_id: str) -> str: ...
    def write_audio(self, folder: str, filename: str, audio: bytes) -> None: ...
    def write_zip(self, folder: str, filenames: list[str]) -> bool: ...


class BatchRepository(Protocol):
    def voice_bindings(self) -> list[dict]: ...
    def catalogue_voices(self) -> list[dict]: ...
    def pronunciations(self) -> list[dict]: ...
    def today_spend(self) -> float: ...


class BatchSpeechProvider(Protocol):
    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                pronunciations: list[dict], preferences: dict
                ) -> PreparedSpeech: ...
    def synthesize(self, prepared: PreparedSpeech,
                   on_progress=None) -> SynthesizedSpeech: ...


def _known_voice_ids(bindings: list[dict]) -> set[str]:
    return {str(item.get("binding_id") or item.get("catalogue_voice_id") or "")
            for item in bindings
            if item.get("binding_id") or item.get("catalogue_voice_id")}


def _voice_check(sheet: dict, column: int | None,
                 known: set[str]) -> dict:
    if column is None:
        return {"unknown": [], "checked": 0}
    seen: set[str] = set()
    unknown: dict[str, int] = {}
    for index, row in enumerate(sheet["rows"], 2):
        value = spreadsheet.cell(row, column)
        if not value or value in seen:
            continue
        seen.add(value)
        if value not in known:
            unknown[value] = index
    return {
        "unknown": [{"voice": voice, "first_row": row}
                    for voice, row in unknown.items()],
        "checked": len(seen),
    }


class BatchIntakeService:
    def __init__(self, workspace: BatchWorkspace,
                 repository: BatchRepository):
        self.workspace = workspace
        self.repository = repository

    def preview(self, raw: bytes, filename: str) -> dict:
        if not raw:
            raise ValueError("Choose a spreadsheet first.")
        if len(raw) > 25_000_000:
            raise ValueError("That spreadsheet is over 25 MB.")
        safe_name = Path(unquote(filename)).name or "sheet.csv"
        sheet = self.workspace.parse_sheet(safe_name, raw)
        token = self.workspace.save_sheet(sheet)
        guess = spreadsheet.guess_columns(sheet["headers"])
        known = _known_voice_ids([
            *self.repository.voice_bindings(), *self.repository.catalogue_voices()])
        return {
            "token": token, "name": safe_name, "headers": sheet["headers"],
            "rows": len(sheet["rows"]), "preview": sheet["rows"][:8],
            "guess": guess,
            "voices": _voice_check(sheet, guess.get("voice"), known),
            "truncated": sheet["truncated"], "max_rows": spreadsheet.MAX_ROWS,
        }

    def validate_voice_column(self, token: str, column: int | None) -> dict:
        sheet = self.workspace.load_sheet(token)
        width = len(sheet.get("headers") or [])
        checked_column = _column({"voice": column}, "voice", width)
        known = _known_voice_ids([
            *self.repository.voice_bindings(),
            *self.repository.catalogue_voices(),
        ])
        return _voice_check(sheet, checked_column, known)


def _column(columns: dict, key: str, width: int,
            *, required: bool = False) -> int | None:
    value = columns.get(key)
    if value is None and not required:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"The {key} column is invalid.")
    if value >= width:
        raise ValueError(f"The {key} column is no longer in this spreadsheet.")
    return value


def _unique_filename(label: str, fallback: str, extension: str,
                     used: set[str]) -> str:
    stem = spreadsheet.safe_name(label, fallback)
    candidate = f"{stem}.{extension}"
    if candidate.casefold() in used:
        candidate = f"{stem}-{fallback}.{extension}"
    suffix = 2
    root = candidate
    while candidate.casefold() in used:
        candidate = f"{Path(root).stem}-{suffix}.{extension}"
        suffix += 1
    used.add(candidate.casefold())
    return candidate


def _sum_usage(total: dict[str, int | float], values: dict) -> None:
    for key, value in values.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        total[key] = total.get(key, 0) + value


def _human_error(error: Exception) -> str:
    message = str(error).strip()
    lowered = f"{type(error).__name__} {message}".lower()
    if "apikey" in lowered or "api key" in lowered or "unauthorized" in lowered:
        return ("Your API key was rejected. Check it in Settings, and confirm "
                "that its region matches Audio Studio.")
    if "arrearage" in lowered or "insufficient" in lowered or "quota" in lowered:
        return ("Alibaba refused the request over billing or quota. Check your "
                "Model Studio account.")
    if "voice" in lowered and ("not exist" in lowered or "unsupported" in lowered):
        return "That voice is unavailable for the selected Alibaba model."
    return message if isinstance(error, RuntimeError) and message else (
        f"{type(error).__name__}: {message}" if message else type(error).__name__)


class BatchGenerationService:
    def __init__(self, workspace: BatchWorkspace,
                 repository: BatchRepository, provider: BatchSpeechProvider,
                 preferences: Callable[[], dict],
                 operations: ProviderOperationService | None = None):
        self.workspace = workspace
        self.repository = repository
        self.provider = provider
        self.preferences = preferences
        self.operations = operations

    def run(self, *, token: str, columns: dict,
            voice_identity_id: str | None = None,
            format: str = "mp3", language: str = "",
            instruction: str = "", rate: float = 1, pitch: float = 1,
            volume: int = 50, confirmed: bool = False,
            binding_id: str | None = None,
            catalogue_voice_id: str | None = None,
            capability_id: str | None = None,
            run_id: str = "batch", job_id: int | None = None,
            on_progress=None) -> dict:
        sheet = self.workspace.load_sheet(token)
        width = len(sheet.get("headers") or [])
        text_column = _column(columns, "text", width, required=True)
        name_column = _column(columns, "name", width)
        voice_column = _column(columns, "voice", width)
        language_column = _column(columns, "language", width)
        rows = [(index, row, spreadsheet.cell(row, text_column))
                for index, row in enumerate(sheet.get("rows") or [], 2)]
        rows = [item for item in rows if item[2]]
        if not rows:
            raise ValueError("That column is empty on every row.")

        bindings = self.repository.voice_bindings()
        catalogue = self.repository.catalogue_voices()
        routes = [*bindings, *catalogue]
        known = _known_voice_ids(routes)
        selected_voices = _voice_check(sheet, voice_column, known)
        default_route_id = binding_id or catalogue_voice_id or ""
        if default_route_id not in known:
            raise ValueError("The default voice is no longer available.")
        if selected_voices["unknown"]:
            detail = ", ".join(
                f"{item['voice']} (row {item['first_row']})"
                for item in selected_voices["unknown"][:5])
            raise ValueError(f"Unknown voice IDs: {detail}.")

        pronunciations = self.repository.pronunciations()
        preferences = self.preferences()
        prepared_rows: list[tuple[int, list, PreparedSpeech]] = []
        defaults = {
            "voice_identity_id": voice_identity_id,
            "binding_id": binding_id, "catalogue_voice_id": catalogue_voice_id,
            "capability_id": capability_id,
            "format": format,
            "language": language, "instruction": instruction,
            "rate": rate, "pitch": pitch, "volume": volume,
        }
        for row_number, row, words in rows:
            row_route_id = spreadsheet.cell(row, voice_column) or default_route_id
            row_route = next(item for item in routes if (
                item.get("binding_id") or item.get("catalogue_voice_id")) == row_route_id)
            values = {
                **defaults, "text": words,
                "voice": row_route.get("provider_voice_id") or "",
                "binding_id": row_route.get("binding_id"),
                "catalogue_voice_id": row_route.get("catalogue_voice_id"),
                "voice_identity_id": row_route.get("identity_id")
                                     if row_route.get("binding_id") else None,
                "language": (spreadsheet.cell(row, language_column)
                             or language),
            }
            prepared_rows.append((
                row_number, row,
                self.provider.prepare(
                    text=words, values=values, bindings=bindings,
                    catalogue=catalogue,
                    pronunciations=pronunciations, preferences=preferences),
            ))

        estimate = round(sum(item[2].estimated_cost
                             for item in prepared_rows), 6)
        warning = float(preferences.get("warn_above") or 0)
        if warning > 0 and estimate > warning and not confirmed:
            return {"needs_confirmation": True, "estimate": estimate,
                    "estimated_cost": estimate, "cost": 0}

        # Establish the local destination before reserving paid capacity. A
        # filesystem failure is not a provider operation and must not leave an
        # active reservation behind.
        folder = self.workspace.create_output(token, run_id)
        reservation_id = None
        if self.operations and job_id:
            reservation_id = self.operations.authorize(
                job_id, "batch_speech", estimate, preferences, confirmed)

        results: list[dict[str, Any]] = []
        files: list[str] = []
        problems: list[dict[str, Any]] = []
        used_names: set[str] = set()
        usage: dict[str, int | float] = {}
        total_cost = 0.0
        models: set[str] = set()
        engines: set[str] = set()
        voices: set[str] = set()
        regions: set[str] = set()
        endpoints: set[str] = set()
        bases: set[str] = set()
        price_versions: set[str] = set()
        request_ids: list[str] = []

        for done, (row_number, row, prepared) in enumerate(prepared_rows):
            if on_progress:
                on_progress(done, len(prepared_rows),
                            f"Speaking spreadsheet row {row_number}")
            label = (spreadsheet.cell(row, name_column)
                     or f"row-{row_number}")
            attempt_id = None
            provider_succeeded = False
            try:
                if self.operations and job_id:
                    attempt_id = self.operations.repository.begin_attempt(
                        job_id, "speech", prepared.voice_route or {
                            "provider": prepared.provider,
                            "region": prepared.provider_region,
                            "model": prepared.model_id,
                            "binding_id": prepared.binding_id,
                            "catalogue_voice_id": prepared.catalogue_voice_id,
                        }, {"row": row_number,
                            "text_length": len(prepared.spoken_text)},
                        reservation_id,
                        estimated_cost=prepared.estimated_cost)
                    self.operations.repository.mark_sent(attempt_id)
                made = self.provider.synthesize(prepared)
                if not made.audio:
                    raise RuntimeError("Alibaba returned no audio.")
                if made.failures:
                    raise RuntimeError(
                        "The provider could not complete every speech "
                        "section. No incomplete row was saved.")
                total_cost += float(made.cost)
                _sum_usage(usage, made.usage)
                models.add(prepared.model_id)
                engines.add(prepared.engine)
                voices.add(prepared.voice)
                if made.provider_region:
                    regions.add(made.provider_region)
                if made.provider_endpoint:
                    endpoints.add(made.provider_endpoint)
                bases.add(made.cost_basis)
                if made.price_version:
                    price_versions.add(made.price_version)
                request_ids.extend(made.request_ids)
                if attempt_id:
                    self.operations.repository.finish_attempt(
                        attempt_id, "succeeded", cost=float(made.cost),
                        usage=made.usage, request_ids=made.request_ids, error={},
                        receipt={
                            "row": row_number,
                            "audio_sha256": hashlib.sha256(made.audio).hexdigest(),
                            "size_bytes": len(made.audio),
                            "format": prepared.output_format,
                            "provider_region": made.provider_region,
                            "provider_endpoint": made.provider_endpoint,
                        }, reconcile_budget=False)
                    provider_succeeded = True
                filename = _unique_filename(
                    label, f"row-{row_number}", prepared.extension, used_names)
                self.workspace.write_audio(folder, filename, made.audio)
                files.append(filename)
                if attempt_id:
                    self.operations.repository.record_artifact(attempt_id, {
                        "type": "batch_audio", "folder": folder,
                        "filename": filename, "size_bytes": len(made.audio),
                    })
                item = {
                    "row": row_number, "name": filename,
                    "text": prepared.original_text[:90],
                    "url": f"/batch-audio/{folder}/{filename}",
                    "size_mb": round(len(made.audio) / 1_000_000, 2),
                    "cost": round(float(made.cost), 6),
                    "cost_basis": made.cost_basis,
                    "model": prepared.model_id, "engine": prepared.engine,
                    "voice": prepared.voice,
                    "voice_identity_id": prepared.voice_identity_id,
                    "binding_id": prepared.binding_id,
                    "catalogue_voice_id": prepared.catalogue_voice_id,
                    "capability_id": prepared.capability_id,
                    "language": prepared.language,
                    "usage": made.usage, "request_ids": made.request_ids,
                    "price_version": made.price_version,
                    "catalog_rate": made.catalog_rate,
                    "failed_parts": len(made.failures),
                }
                results.append(item)
            except Exception as error:
                if (self.operations and job_id and attempt_id
                        and not provider_succeeded):
                    status = self.operations.failure_status(error)
                    self.operations.repository.finish_attempt(
                        attempt_id, status,
                        cost=(prepared.estimated_cost
                              if status == "ambiguous" else 0),
                        usage={}, request_ids=[],
                        error={"type": type(error).__name__,
                               "message": str(error)[:600], "row": row_number},
                        reconcile_budget=False)
                    if status == "ambiguous":
                        self.operations.repository.reconcile_budget(
                            job_id, total_cost + prepared.estimated_cost,
                            "ambiguous")
                        raise JobFailed(
                            "A Batch row lost its provider response. Review the "
                            "ambiguous attempt before retrying this paid Batch.",
                            {"provider_attempt_id": attempt_id,
                             "ambiguous": True,
                             "cost": round(
                                 total_cost + prepared.estimated_cost, 6),
                             "estimated_cost": estimate,
                             "usage": usage, "failed_row": row_number}) from error
                item = {"row": row_number,
                        "text": prepared.original_text[:90],
                        "error": (
                            "The provider completed this paid row, but Audio "
                            "Studio could not retain its file. Provider evidence "
                            "was preserved; only an operator may create a new "
                            "paid attempt."
                            if provider_succeeded else _human_error(error))}
                results.append(item)
                problems.append(item)

        if on_progress:
            on_progress(len(prepared_rows), len(prepared_rows), "Batch complete")
        if self.operations and reservation_id and job_id:
            self.operations.repository.reconcile_budget(
                job_id, total_cost, "succeeded")
        zipped = self.workspace.write_zip(folder, files) if files else False
        usage.update({"rows_made": len(files),
                      "rows_failed": len(results) - len(files),
                      "characters": sum(len(item[2].spoken_text)
                                        for item in prepared_rows)})
        cost_basis = next(iter(bases)) if len(bases) == 1 else (
            "mixed_usage" if bases else "not_billed")
        model_id = next(iter(models)) if len(models) == 1 else (
            "mixed" if models else "")
        resolved_engine = next(iter(engines)) if len(engines) == 1 else (
            "mixed" if engines else "")
        resolved_voice = next(iter(voices)) if len(voices) == 1 else (
            "mixed" if voices else "")
        region = next(iter(regions)) if len(regions) == 1 else (
            "mixed" if regions else None)
        endpoint = next(iter(endpoints)) if len(endpoints) == 1 else None
        return {
            "results": results, "cost": round(total_cost, 6),
            "estimated_cost": estimate, "cost_basis": cost_basis,
            "folder": folder,
            "zip": f"/batch-audio/{folder}/all.zip" if zipped else None,
            "made": len(files), "failed": len(results) - len(files),
            "failures": problems, "usage": usage,
            "chars": int(usage["characters"]), "model": model_id,
            "engine": resolved_engine, "voice": resolved_voice,
            "provider_region": region, "provider_endpoint": endpoint,
            "price_version": (next(iter(price_versions))
                              if len(price_versions) == 1 else None),
            "provider_request_id": (request_ids[0]
                                    if len(request_ids) == 1 else None),
            "request_ids": request_ids,
        }


class BatchJobHandler:
    def __init__(self, service: BatchGenerationService):
        self.service = service

    def __call__(self, job: Job, repository) -> dict:
        repository.progress(job.id, 0, 1, "Preparing spreadsheet rows")
        return self.service.run(
            **{key: value for key, value in job.payload.items()
               if key in {"token", "columns", "voice_identity_id",
                          "binding_id", "catalogue_voice_id", "capability_id",
                          "format", "language",
                          "instruction", "rate", "pitch", "volume",
                          "confirmed"}},
            run_id=str(job.public_id),
            job_id=job.id,
            on_progress=lambda done, total, detail: repository.progress(
                job.id, done, total, detail),
        )
