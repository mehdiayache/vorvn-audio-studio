"""Canonical work queries and commands without HTTP concerns."""

from __future__ import annotations

from typing import Any

from audio_studio.domain.work import DomainValidation
from audio_studio.infrastructure.postgres import work as repository
from audio_studio.infrastructure.postgres.accounting import (
    ProductionAccountingRepository,
)
from audio_studio.infrastructure.postgres.venture_assets import (
    VentureAssetRepository,
)
from audio_studio.infrastructure.postgres.production_document import (
    ProductionDocumentRepository,
)
from audio_studio.infrastructure.postgres.exports import ProductionExportRepository


KINDS = {"ventures": "venture", "projects": "project",
         "series": "series", "productions": "production"}
asset_repository = VentureAssetRepository()
accounting_repository = ProductionAccountingRepository()
document_repository = ProductionDocumentRepository()
export_repository = ProductionExportRepository()


def hierarchy() -> list[dict[str, Any]]:
    return repository.hierarchy()


def resource(collection: str, resource_id: int) -> dict[str, Any] | None:
    kind = KINDS[collection]
    return (repository.production_get(resource_id) if kind == "production"
            else repository.resource_get(kind, resource_id))


def overview(collection: str, resource_id: int) -> dict[str, Any] | None:
    getters = {"ventures": repository.venture_overview,
               "projects": repository.project_overview,
               "series": repository.series_overview}
    return getters[collection](resource_id)


def venture_assets(venture_id: int) -> dict[str, Any] | None:
    venture = repository.resource_get("venture", venture_id)
    if not venture:
        return None
    return {
        "venture": venture,
        "collections": asset_repository.collections_for_venture(venture_id),
        "assets": asset_repository.list_for_venture(venture_id),
    }


def production_assets(production_id: int) -> dict[str, Any] | None:
    production = repository.production_get(production_id)
    if not production or not production.get("trail"):
        return None
    venture_id = int(production["trail"][0]["id"])
    return venture_assets(venture_id)


def production_editor(production_id: int) -> dict[str, Any] | None:
    production = repository.production_get(production_id)
    if not production:
        return None
    parts = document_repository.parts(production_id)
    exports = export_repository.list(production_id)
    visible = [part for part in parts if part.get("kind") != "stitch"]
    accounting = accounting_repository.one(production_id)
    return {**production, "parts": parts, "exports": exports,
            "total_cost": accounting["historical_spend"],
            "current_sequence_cost": accounting["current_sequence_cost"],
            "accounting": accounting,
            "total_bytes": sum(part["size_bytes"] or 0 for part in visible)}


def create(collection: str, parent_id: int | None, name: str,
           description: str = "") -> dict[str, Any] | None:
    if collection == "ventures":
        created = repository.create_venture(name, description)
        if created:
            asset_repository.ensure_collections(int(created["id"]))
        return created
    if collection == "projects":
        return repository.create_project(int(parent_id or 0), name, description)
    if collection == "series":
        return repository.create_series(int(parent_id or 0), name, description)
    if collection == "productions":
        return repository.create_production(int(parent_id or 0), name, description)
    raise DomainValidation("Unknown resource type.")


def create_in_series(series_id: int, name: str,
                     description: str = "") -> dict[str, Any] | None:
    series = repository.resource_get("series", series_id)
    if not series:
        return None
    project_id = int(series["parent_key"].split(":", 1)[1])
    return repository.create_production(project_id, name, description, series_id)


def update(collection: str, resource_id: int,
           changes: dict[str, Any]) -> dict[str, Any] | None:
    kind = KINDS[collection]
    if kind == "series" and "defaults" in changes:
        allowed = {
            "voice", "voice_identity_id", "engine", "model", "format",
            "language", "instruction", "speech_mode", "rate", "pitch",
            "volume", "seed",
        }
        defaults = changes["defaults"] or {}
        unknown = set(defaults) - allowed
        if unknown:
            raise DomainValidation(
                f"Unknown Series default: {sorted(unknown)[0]}.")
        if defaults.get("engine") not in {None, "", "audio", "omni"}:
            raise DomainValidation("Series speech engine must be Audio or Omni.")
        if defaults.get("model") not in {None, "", "plus", "flash"}:
            raise DomainValidation("Series quality must be Plus or Flash.")
        if defaults.get("speech_mode") not in {None, "", "exact", "directed"}:
            raise DomainValidation(
                "Series reading mode must be exact or directed.")
        changes["defaults"] = {
            key: value for key, value in defaults.items()
            if value not in (None, "")
        }
    if kind == "production" and "series_id" in changes:
        series_id = changes.pop("series_id")
        moved = repository.move_production(
            resource_id, None if series_id in (None, "") else int(series_id))
        if not changes:
            return moved
    return repository.update_resource(kind, resource_id, changes)


def remove(collection: str, resource_id: int,
           make_standalone: bool = False) -> dict[str, Any] | None:
    kind = KINDS[collection]
    if kind == "series":
        return repository.delete_series(resource_id, make_standalone)
    return repository.archive_resource(kind, resource_id)
