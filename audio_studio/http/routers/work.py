"""Native canonical work API: Venture through Production."""

from __future__ import annotations

import base64
from typing import Any

from fastapi import APIRouter, Query, status

from audio_studio.application import work
from audio_studio.http.contracts import ResourceCreate, ResourceUpdate
from audio_studio.http.errors import ApiProblem
from domain import repository


router = APIRouter(prefix="/api/v1", tags=["work"])


def _page(items: list[dict[str, Any]], limit: int, after: str | None) -> dict:
    offset = 0
    if after:
        try:
            offset = int(base64.urlsafe_b64decode(after + "===").decode())
        except (ValueError, UnicodeDecodeError):
            raise ApiProblem(400, "invalid_cursor", "That pagination cursor is invalid.")
    page = items[offset:offset + limit]
    next_offset = offset + len(page)
    next_cursor = (base64.urlsafe_b64encode(str(next_offset).encode()).decode().rstrip("=")
                   if next_offset < len(items) else None)
    return {"data": page, "meta": {"count": len(page), "total": len(items),
                                     "next_cursor": next_cursor}}


@router.get("/hierarchy", operation_id="listHierarchy")
def list_hierarchy(limit: int = Query(100, ge=1, le=100),
                   after: str | None = None) -> dict:
    return _page(work.hierarchy(), limit, after)


@router.get("/ventures", operation_id="listVentures")
def list_ventures(limit: int = Query(100, ge=1, le=100),
                  after: str | None = None) -> dict:
    return _page([item for item in work.hierarchy() if item["type"] == "venture"],
                 limit, after)


def _get_resource(collection: str, resource_id: int) -> dict:
    item = work.resource(collection, resource_id)
    if not item:
        raise ApiProblem(404, f"{work.KINDS[collection]}_not_found",
                         f"That {work.KINDS[collection]} does not exist.")
    return {"data": item}


@router.get("/ventures/{resource_id}", operation_id="getVenture")
def get_venture(resource_id: int) -> dict:
    return _get_resource("ventures", resource_id)


@router.get("/projects/{resource_id}", operation_id="getProject")
def get_project(resource_id: int) -> dict:
    return _get_resource("projects", resource_id)


@router.get("/series/{resource_id}", operation_id="getSeries")
def get_series(resource_id: int) -> dict:
    return _get_resource("series", resource_id)


@router.get("/productions/{resource_id}", operation_id="getProduction")
def get_production(resource_id: int) -> dict:
    return _get_resource("productions", resource_id)


def _get_overview(collection: str, resource_id: int) -> dict:
    item = work.overview(collection, resource_id)
    if not item:
        raise ApiProblem(404, f"{work.KINDS[collection]}_not_found",
                         f"That {work.KINDS[collection]} does not exist.")
    return {"data": item}


@router.get("/ventures/{resource_id}/overview", operation_id="getVentureOverview")
def get_venture_overview(resource_id: int) -> dict:
    return _get_overview("ventures", resource_id)


@router.get("/ventures/{resource_id}/assets", operation_id="listVentureAssets")
def list_venture_assets(resource_id: int) -> dict:
    result = work.venture_assets(resource_id)
    if not result:
        raise ApiProblem(404, "venture_not_found", "That Venture does not exist.")
    return {"data": result}


@router.get("/projects/{resource_id}/overview", operation_id="getProjectOverview")
def get_project_overview(resource_id: int) -> dict:
    return _get_overview("projects", resource_id)


@router.get("/series/{resource_id}/overview", operation_id="getSeriesOverview")
def get_series_overview(resource_id: int) -> dict:
    return _get_overview("series", resource_id)


@router.get("/productions/{production_id}/editor", operation_id="getProductionEditor")
def get_production_editor(production_id: int) -> dict:
    item = work.production_editor(production_id)
    if not item:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": item}


@router.get("/productions/{production_id}/assets", operation_id="listProductionAssets")
def list_production_assets(production_id: int) -> dict:
    item = work.production_assets(production_id)
    if not item:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": item}


@router.post("/ventures", status_code=status.HTTP_201_CREATED,
             operation_id="createVenture")
def create_venture(payload: ResourceCreate) -> dict:
    return {"data": work.create("ventures", None, payload.name, payload.description)}


@router.post("/ventures/{venture_id}/projects", status_code=status.HTTP_201_CREATED,
             operation_id="createProject")
def create_project(venture_id: int, payload: ResourceCreate) -> dict:
    created = work.create("projects", venture_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "venture_not_found", "That Venture does not exist.")
    return {"data": created}


@router.post("/projects/{project_id}/series", status_code=status.HTTP_201_CREATED,
             operation_id="createSeries")
def create_series(project_id: int, payload: ResourceCreate) -> dict:
    created = work.create("series", project_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": created}


@router.post("/projects/{project_id}/productions", status_code=status.HTTP_201_CREATED,
             operation_id="createProduction")
def create_production(project_id: int, payload: ResourceCreate) -> dict:
    created = work.create("productions", project_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": created}


@router.post("/series/{series_id}/productions", status_code=status.HTTP_201_CREATED,
             operation_id="createSeriesProduction")
def create_series_production(series_id: int, payload: ResourceCreate) -> dict:
    created = work.create_in_series(series_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "series_not_found", "That Series does not exist.")
    return {"data": created}


def _update_resource(collection: str, resource_id: int,
                     payload: ResourceUpdate) -> dict:
    try:
        updated = work.update(collection, resource_id, payload.changes())
    except repository.DomainConflict as exc:
        raise ApiProblem(409, "domain_conflict", str(exc)) from exc
    except repository.DomainValidation as exc:
        raise ApiProblem(400, "invalid_resource", str(exc)) from exc
    if not updated:
        raise ApiProblem(404, f"{work.KINDS[collection]}_not_found",
                         f"That {work.KINDS[collection]} does not exist.")
    return {"data": updated}


@router.patch("/ventures/{resource_id}", operation_id="updateVenture")
def update_venture(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("ventures", resource_id, payload)


@router.patch("/projects/{resource_id}", operation_id="updateProject")
def update_project(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("projects", resource_id, payload)


@router.patch("/series/{resource_id}", operation_id="updateSeries")
def update_series(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("series", resource_id, payload)


@router.patch("/productions/{resource_id}", operation_id="updateProduction")
def update_production(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("productions", resource_id, payload)


def _delete_resource(collection: str, resource_id: int,
                     strategy: str = "") -> dict:
    try:
        removed = work.remove(collection, resource_id,
                              make_standalone=strategy == "make_standalone")
    except repository.DomainConflict as exc:
        raise ApiProblem(409, "domain_conflict", str(exc)) from exc
    if not removed:
        raise ApiProblem(404, f"{work.KINDS[collection]}_not_found",
                         f"That {work.KINDS[collection]} does not exist.")
    return {"data": removed}


@router.delete("/ventures/{resource_id}", operation_id="deleteVenture")
def delete_venture(resource_id: int) -> dict:
    return _delete_resource("ventures", resource_id)


@router.delete("/projects/{resource_id}", operation_id="deleteProject")
def delete_project(resource_id: int) -> dict:
    return _delete_resource("projects", resource_id)


@router.delete("/series/{resource_id}", operation_id="deleteSeries")
def delete_series(resource_id: int, strategy: str = "") -> dict:
    return _delete_resource("series", resource_id, strategy)


@router.delete("/productions/{resource_id}", operation_id="deleteProduction")
def delete_production(resource_id: int) -> dict:
    return _delete_resource("productions", resource_id)
