"""One durable use case for validating, creating and preparing Productions."""

from __future__ import annotations

from typing import Any, Protocol

from audio_studio.application.jobs import JobProgress
from audio_studio.application.timeline import TimelineService
from audio_studio.domain.jobs import Job, JobFailed


LEGACY_GENERATION_FIELDS = {
    "speech_mode", "rate", "pitch", "volume", "seed", "format",
}


def normalized_role(value: object) -> tuple[str, str]:
    label = " ".join(str(value or "").split())
    return label, label.casefold()


def summarize_document(document: dict[str, Any]) -> dict[str, Any]:
    roles: dict[str, dict[str, Any]] = {}
    speech = 0
    silence = 0
    legacy_hints = 0
    estimated_duration_ms = 0
    for item in document.get("items") or []:
        if item.get("type") == "silence":
            silence += 1
            estimated_duration_ms += round(float(item.get("seconds") or 0) * 1000)
            continue
        speech += 1
        label, key = normalized_role(item.get("role"))
        known = roles.setdefault(key, {"name": label, "count": 0})
        known["count"] += 1
        words = len(str(item.get("text") or "").split())
        estimated_duration_ms += max(800, round(words / 150 * 60_000))
        if any(item.get(field) is not None for field in LEGACY_GENERATION_FIELDS):
            legacy_hints += 1
    return {
        "speech": speech,
        "silence": silence,
        "items": speech + silence,
        "roles": list(roles.values()),
        "language": document.get("language"),
        "estimated_duration_ms": estimated_duration_ms,
        "legacy_generation_hints": legacy_hints,
    }


class WorkCommands(Protocol):
    def create(self, collection: str, parent_id: int | None, name: str,
               description: str = "") -> dict[str, Any] | None: ...
    def create_in_series(self, series_id: int, name: str,
                         description: str = "") -> dict[str, Any] | None: ...
    def update(self, collection: str, resource_id: int,
               changes: dict[str, Any]) -> dict[str, Any] | None: ...
    def remove(self, collection: str, resource_id: int,
               make_standalone: bool = False) -> dict[str, Any] | None: ...


class VoiceRoutes(Protocol):
    def resolve_voice(self, payload: dict) -> dict: ...


class TextPreparation(Protocol):
    repository: Any

    def prepare(self, *, operation: str, text: str,
                production_id: int | None = None,
                part_id: int | None = None, density: str = "normal",
                spoken_profile: str = "spoken_1",
                capability_id: str, confirmed: bool = False,
                source_job_id: int | None = None) -> dict: ...


class ProductionImportJobHandler:
    """Execute one import request exactly once, then prepare its Draft text."""

    def __init__(self, work: WorkCommands, timeline: TimelineService,
                 catalog: VoiceRoutes, text: TextPreparation):
        self.work = work
        self.timeline = timeline
        self.catalog = catalog
        self.text = text

    def __call__(self, job: Job, progress: JobProgress) -> dict[str, Any]:
        payload = job.payload
        document = dict(payload.get("document") or {})
        destination = dict(payload.get("destination") or {})
        preparation = dict(payload.get("preparation") or {})
        routes = self._routes(document, dict(payload.get("role_routes") or {}))
        self._validate_preparation(routes, preparation)

        created = destination.get("kind") == "new"
        resource = self._destination(
            destination, str(payload.get("title") or "").strip(),
            str(payload.get("description") or ""))
        if not resource:
            raise ValueError("The destination Production could not be created.")
        production_id = int(resource["id"])
        progress.progress(job.id, 0, 1, "Building the Production")
        try:
            imported = self.timeline.import_document(
                production_id, document, routes, preparation)
        except Exception:
            if created:
                self.work.remove("productions", production_id)
            raise

        try:
            cost, usage = self._prepare_parts(
                job, progress, production_id,
                list(imported.get("speech_parts") or []), preparation)
        except Exception as exc:
            raise JobFailed(
                str(exc), result={
                    "production_id": production_id,
                    "production_public_id": str(resource.get("public_id") or ""),
                    "title": str(resource.get("name") or payload.get("title") or ""),
                    "items": int(imported["items"]),
                    "speech": int(imported["speech"]),
                    "silence": int(imported["silence"]),
                    "preparation_incomplete": True,
                }) from exc
        return {
            "production_id": production_id,
            "production_public_id": str(resource.get("public_id") or ""),
            "title": str(resource.get("name") or payload.get("title") or ""),
            "items": int(imported["items"]),
            "speech": int(imported["speech"]),
            "silence": int(imported["silence"]),
            "cost": cost,
            "usage": usage,
        }

    def _destination(self, destination: dict[str, Any], title: str,
                     description: str) -> dict[str, Any] | None:
        if destination.get("kind") == "existing":
            return self.work.update("productions", int(destination["production_id"]), {
                "name": title, "description": description,
            })
        parent_id = int(destination["parent_id"])
        if destination.get("parent_type") == "series":
            return self.work.create_in_series(parent_id, title, description)
        return self.work.create("productions", parent_id, title, description)

    def _routes(self, document: dict[str, Any], selections: dict[str, Any]) \
            -> dict[str, dict[str, Any]]:
        roles = {normalized_role(item.get("role"))[1]: normalized_role(
            item.get("role"))[0] for item in document.get("items") or []
                 if item.get("type") == "speech"}
        supplied = {normalized_role(role)[1]: dict(selection)
                    for role, selection in selections.items()}
        missing = [roles[key] for key in roles.keys() - supplied.keys()]
        extra = [key for key in supplied.keys() - roles.keys()]
        if missing:
            raise ValueError("Map every role before importing. Missing: "
                             + ", ".join(sorted(missing)))
        if extra:
            raise ValueError("Remove role mappings not present in the document.")
        resolved: dict[str, dict[str, Any]] = {}
        for key, label in roles.items():
            selected = supplied[key]
            route = self.catalog.resolve_voice({
                **selected,
                "language": document.get("language") or "Auto",
                "text": "",
            })
            expected_identity = str(selected.get("voice_identity_id") or "")
            if route.get("identity_id") != expected_identity:
                raise ValueError(
                    f"The selected recording route does not belong to {label}'s Voice.")
            resolved[key] = {**route, "role": label}
        return resolved

    def _validate_preparation(self, routes: dict[str, dict[str, Any]],
                              preparation: dict[str, Any]) -> None:
        capabilities = {str(route.get("capability_id") or "")
                        for route in routes.values()}
        if len(capabilities) != 1:
            raise ValueError("Choose one recording method shared by every role.")
        if preparation.get("tag_density") == "none":
            return
        capability_id = next(iter(capabilities), "")
        controls = self.text.repository.capability_controls(capability_id)
        if controls.get("delivery_tags") is not True:
            raise ValueError(
                "The selected recording method does not support delivery tags.")

    def _prepare_parts(self, job: Job, progress: JobProgress,
                       production_id: int, parts: list[dict[str, Any]],
                       preparation: dict[str, Any]) -> tuple[float, dict[str, Any]]:
        text_version = str(preparation.get("text_version") or "imported")
        density = str(preparation.get("tag_density") or "none")
        operations = int(text_version != "imported") + int(density != "none")
        total = max(1, len(parts) * operations)
        done = 0
        cost = 0.0
        usage: dict[str, Any] = {"parts": len(parts), "passes": 0}
        if not operations:
            progress.progress(job.id, 1, 1, "Production ready for review")
            return cost, usage
        for index, part in enumerate(parts, start=1):
            raw = str(part["text"])
            capability_id = str(part["capability_id"])
            shaped: str | None = None
            tagged: str | None = None
            current = raw
            if text_version != "imported":
                progress.progress(
                    job.id, done, total,
                    f"Preparing Spoken text {index} of {len(parts)}")
                result = self.text.prepare(
                    operation="shape", text=current,
                    production_id=production_id, part_id=int(part["id"]),
                    spoken_profile=text_version, capability_id=capability_id,
                    confirmed=True, source_job_id=job.id)
                shaped = str(result["after"])
                current = shaped
                cost += float(result.get("cost") or 0)
                done += 1
            if density != "none":
                progress.progress(
                    job.id, done, total,
                    f"Adding delivery tags {index} of {len(parts)}")
                result = self.text.prepare(
                    operation="tag", text=current,
                    production_id=production_id, part_id=int(part["id"]),
                    density=density, capability_id=capability_id,
                    confirmed=True, source_job_id=job.id)
                tagged = str(result["after"])
                current = tagged
                cost += float(result.get("cost") or 0)
                done += 1
            state = "tagged" if tagged is not None else (
                "shaped" if shaped is not None else "raw")
            self.timeline.save_draft(production_id, int(part["id"]), {
                "text": current,
                "text_raw": raw,
                "text_shaped": shaped,
                "text_tagged": tagged,
                "text_state": state,
                "spoken_profile": text_version if text_version != "imported"
                else "spoken_1",
            })
            usage["passes"] = done
        progress.progress(job.id, total, total, "Production ready for review")
        return cost, usage
