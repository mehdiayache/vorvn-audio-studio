"""Canonical work queries and commands without HTTP concerns."""

from __future__ import annotations

from typing import Any

import db
from domain import repository


KINDS = {"ventures": "venture", "projects": "project",
         "series": "series", "productions": "production"}


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
    db.ensure_assets(venture_id)
    return {
        "venture": venture,
        "collections": db.asset_collections_for_venture(venture_id),
        "assets": db.venture_assets(venture_id),
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
    legacy_id = int(production["legacy_container_id"])
    parts = db.project_parts(legacy_id)
    subtitled = db.transcribed_ids(legacy_id)
    translated = db.translated_ids(legacy_id)
    for part in parts:
        part["takes"] = db.take_count(part["id"])
        part["subtitled"] = part["id"] in subtitled
        part["subtitles_stale"] = bool(subtitled.get(part["id"]))
        part["languages"] = sorted(set(translated.get(part["id"], [])))
    visible = [part for part in parts if part.get("kind") != "stitch"]
    accounting = db.production_accounting(production_id)
    return {**production, "parts": parts,
            "total_cost": accounting["historical_spend"],
            "current_sequence_cost": accounting["current_sequence_cost"],
            "accounting": accounting,
            "total_bytes": sum(part["size_bytes"] or 0 for part in visible)}


def create(collection: str, parent_id: int | None, name: str,
           description: str = "") -> dict[str, Any] | None:
    if collection == "ventures":
        return repository.create_venture(name, description)
    if collection == "projects":
        return repository.create_project(int(parent_id or 0), name, description)
    if collection == "series":
        return repository.create_series(int(parent_id or 0), name, description)
    if collection == "productions":
        return repository.create_production(int(parent_id or 0), name, description)
    raise repository.DomainValidation("Unknown resource type.")


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
