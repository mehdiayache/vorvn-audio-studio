"""Native canonical work API: Venture through Production."""

from __future__ import annotations

import base64
from typing import Any

from fastapi import APIRouter, Query, status

from audio_studio.application.work import KINDS
from audio_studio.composition.work import work_service
from audio_studio.domain.work import DomainConflict, DomainValidation
from audio_studio.http.contracts import ResourceCreate, ResourceUpdate
from audio_studio.http.errors import ApiProblem
from audio_studio.http.work_contracts import (
    ArchivedResourceEnvelope,
    HierarchyPageEnvelope,
    ProductionEditorEnvelope,
    ProjectOverviewEnvelope,
    ResourceMutationEnvelope,
    SeriesOverviewEnvelope,
    VentureAssetLibraryEnvelope,
    VentureOverviewEnvelope,
    WorkResourceEnvelope,
)


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


@router.get("/hierarchy", operation_id="listHierarchy",
            response_model=HierarchyPageEnvelope,
            response_model_exclude_none=True)
def list_hierarchy(limit: int = Query(100, ge=1, le=100),
                   after: str | None = None) -> dict:
    return _page(work_service.hierarchy(), limit, after)


def _get_overview(collection: str, resource_id: str) -> dict:
    item = work_service.overview(collection, resource_id)
    if not item:
        raise ApiProblem(404, f"{KINDS[collection]}_not_found",
                         f"That {KINDS[collection]} does not exist.")
    return {"data": item}


@router.get("/ventures/{resource_id}/overview", operation_id="getVentureOverview",
            response_model=VentureOverviewEnvelope)
def get_venture_overview(resource_id: str) -> dict:
    return _get_overview("ventures", resource_id)


@router.get("/ventures/{resource_id}/assets", operation_id="listVentureAssets",
            response_model=VentureAssetLibraryEnvelope)
def list_venture_assets(resource_id: str) -> dict:
    result = work_service.venture_assets(resource_id)
    if not result:
        raise ApiProblem(404, "venture_not_found", "That Venture does not exist.")
    return {"data": result}


@router.get("/projects/{resource_id}/overview", operation_id="getProjectOverview",
            response_model=ProjectOverviewEnvelope)
def get_project_overview(resource_id: str) -> dict:
    return _get_overview("projects", resource_id)


@router.get("/series/{resource_id}/overview", operation_id="getSeriesOverview",
            response_model=SeriesOverviewEnvelope)
def get_series_overview(resource_id: str) -> dict:
    return _get_overview("series", resource_id)


@router.get("/productions/{production_id}/editor", operation_id="getProductionEditor",
            response_model=ProductionEditorEnvelope)
def get_production_editor(production_id: str) -> dict:
    item = work_service.production_editor(production_id)
    if not item:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": item}


@router.get("/productions/{production_id}/assets", operation_id="listProductionAssets",
            response_model=VentureAssetLibraryEnvelope)
def list_production_assets(production_id: str) -> dict:
    item = work_service.production_assets(production_id)
    if not item:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": item}


@router.post("/ventures", status_code=status.HTTP_201_CREATED,
             operation_id="createVenture", response_model=ResourceMutationEnvelope,
             response_model_exclude_none=True)
def create_venture(payload: ResourceCreate) -> dict:
    return {"data": work_service.create(
        "ventures", None, payload.name, payload.description)}


@router.post("/ventures/{venture_id}/projects", status_code=status.HTTP_201_CREATED,
             operation_id="createProject", response_model=ResourceMutationEnvelope,
             response_model_exclude_none=True)
def create_project(venture_id: int, payload: ResourceCreate) -> dict:
    created = work_service.create(
        "projects", venture_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "venture_not_found", "That Venture does not exist.")
    return {"data": created}


@router.post("/projects/{project_id}/series", status_code=status.HTTP_201_CREATED,
             operation_id="createSeries", response_model=ResourceMutationEnvelope,
             response_model_exclude_none=True)
def create_series(project_id: int, payload: ResourceCreate) -> dict:
    created = work_service.create(
        "series", project_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": created}


@router.post("/projects/{project_id}/productions", status_code=status.HTTP_201_CREATED,
             operation_id="createProduction", response_model=ResourceMutationEnvelope,
             response_model_exclude_none=True)
def create_production(project_id: int, payload: ResourceCreate) -> dict:
    created = work_service.create(
        "productions", project_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": created}


@router.post("/series/{series_id}/productions", status_code=status.HTTP_201_CREATED,
             operation_id="createSeriesProduction",
             response_model=ResourceMutationEnvelope,
             response_model_exclude_none=True)
def create_series_production(series_id: int, payload: ResourceCreate) -> dict:
    created = work_service.create_in_series(
        series_id, payload.name, payload.description)
    if not created:
        raise ApiProblem(404, "series_not_found", "That Series does not exist.")
    return {"data": created}


def _update_resource(collection: str, resource_id: int,
                     payload: ResourceUpdate) -> dict:
    try:
        updated = work_service.update(collection, resource_id, payload.changes())
    except DomainConflict as exc:
        raise ApiProblem(409, "domain_conflict", str(exc)) from exc
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_resource", str(exc)) from exc
    if not updated:
        raise ApiProblem(404, f"{KINDS[collection]}_not_found",
                         f"That {KINDS[collection]} does not exist.")
    return {"data": updated}


@router.patch("/ventures/{resource_id}", operation_id="updateVenture",
              response_model=WorkResourceEnvelope,
              response_model_exclude_none=True)
def update_venture(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("ventures", resource_id, payload)


@router.patch("/projects/{resource_id}", operation_id="updateProject",
              response_model=WorkResourceEnvelope,
              response_model_exclude_none=True)
def update_project(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("projects", resource_id, payload)


@router.patch("/series/{resource_id}", operation_id="updateSeries",
              response_model=WorkResourceEnvelope,
              response_model_exclude_none=True)
def update_series(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("series", resource_id, payload)


@router.patch("/productions/{resource_id}", operation_id="updateProduction",
              response_model=WorkResourceEnvelope,
              response_model_exclude_none=True)
def update_production(resource_id: int, payload: ResourceUpdate) -> dict:
    return _update_resource("productions", resource_id, payload)


def _delete_resource(collection: str, resource_id: int,
                     strategy: str = "") -> dict:
    try:
        removed = work_service.remove(
            collection, resource_id,
            make_standalone=strategy == "make_standalone")
    except DomainConflict as exc:
        raise ApiProblem(409, "domain_conflict", str(exc)) from exc
    if not removed:
        raise ApiProblem(404, f"{KINDS[collection]}_not_found",
                         f"That {KINDS[collection]} does not exist.")
    return {"data": removed}


@router.delete("/ventures/{resource_id}", operation_id="deleteVenture",
               response_model=ArchivedResourceEnvelope,
               response_model_exclude_none=True)
def delete_venture(resource_id: int) -> dict:
    return _delete_resource("ventures", resource_id)


@router.delete("/projects/{resource_id}", operation_id="deleteProject",
               response_model=ArchivedResourceEnvelope,
               response_model_exclude_none=True)
def delete_project(resource_id: int) -> dict:
    return _delete_resource("projects", resource_id)


@router.delete("/series/{resource_id}", operation_id="deleteSeries",
               response_model=ArchivedResourceEnvelope,
               response_model_exclude_none=True)
def delete_series(resource_id: int, strategy: str = "") -> dict:
    return _delete_resource("series", resource_id, strategy)


@router.delete("/productions/{resource_id}", operation_id="deleteProduction",
               response_model=ArchivedResourceEnvelope,
               response_model_exclude_none=True)
def delete_production(resource_id: int) -> dict:
    return _delete_resource("productions", resource_id)
