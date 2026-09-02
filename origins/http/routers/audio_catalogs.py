"""External audio discovery; remote results remain temporary until Keep."""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from origins.composition.audio_catalog import audio_catalog_service
from origins.composition.workspaces import workspace_service
from origins.domain.audio_catalog import (
    AudioCatalogError,
    AudioCatalogSetupError,
)
from origins.domain.uploads import FileCategory
from origins.http.audio_catalog_contracts import (
    CatalogKeepEnvelope,
    CatalogSearchEnvelope,
    CatalogStatusEnvelope,
)
from origins.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1/audio-catalogs", tags=["audio-catalogs"])


class KeepFreesoundBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    external_id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    category: FileCategory | None = None
    tags: list[str] = Field(default_factory=list, max_length=12)
    folder_id: int | None = Field(default=None, gt=0)


@router.get("/freesound/status", operation_id="getFreesoundCatalogStatus",
            response_model=CatalogStatusEnvelope)
def freesound_status() -> dict:
    return {"data": audio_catalog_service.status()}


@router.get("/freesound/search", operation_id="searchFreesound",
            response_model=CatalogSearchEnvelope)
def search_freesound(
    query: str = Query(min_length=2, max_length=200),
    license: str = Query(default="all", pattern="^(all|cc0|cc-by|cc-by-nc)$"),
    duration_min: float | None = Query(default=None, ge=0, le=86_400),
    duration_max: float | None = Query(default=None, gt=0, le=86_400),
) -> dict:
    try:
        return {"data": audio_catalog_service.search(
            query, license_filter=license, duration_min=duration_min,
            duration_max=duration_max)}
    except AudioCatalogSetupError as exc:
        raise ApiProblem(503, "freesound_setup_required", str(exc)) from exc
    except (AudioCatalogError, ValueError) as exc:
        raise ApiProblem(502, "freesound_search_failed", str(exc)) from exc


@router.post(
    "/freesound/workspaces/{workspace_id}/keep",
    operation_id="keepFreesoundFileInWorkspace",
    status_code=201,
    response_model=CatalogKeepEnvelope,
)
def keep_freesound_in_workspace(
    workspace_id: int, payload: KeepFreesoundBody,
) -> dict:
    try:
        return {"data": audio_catalog_service.keep(
            workspace_id=workspace_id, external_id=payload.external_id,
            name=payload.name, category=payload.category,
            tags=tuple(payload.tags), folder_id=payload.folder_id)}
    except AudioCatalogSetupError as exc:
        raise ApiProblem(503, "freesound_setup_required", str(exc)) from exc
    except AudioCatalogError as exc:
        raise ApiProblem(502, "freesound_keep_failed", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_catalog_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "catalog_file_storage_failed", str(exc)) from exc


@router.post(
    "/freesound/projects/{project_id}/keep",
    operation_id="keepFreesoundFileInAudiovisualProject",
    status_code=201,
    response_model=CatalogKeepEnvelope,
)
def keep_freesound_in_audiovisual_project(
    project_id: int, payload: KeepFreesoundBody,
) -> dict:
    project = workspace_service.project(str(project_id))
    if not project:
        raise ApiProblem(404, "project_not_found",
                         "Audiovisual Project not found.")
    try:
        result = audio_catalog_service.keep(
            workspace_id=project["workspace_id"], external_id=payload.external_id,
            name=payload.name, category=payload.category,
            tags=tuple(payload.tags), folder_id=project.get("folder_id"))
        if not workspace_service.attach_file(
                project_id, result["file"]["id"], "audio"):
            raise RuntimeError("The File could not be associated with this Project.")
        return {"data": result}
    except AudioCatalogSetupError as exc:
        raise ApiProblem(503, "freesound_setup_required", str(exc)) from exc
    except AudioCatalogError as exc:
        raise ApiProblem(502, "freesound_keep_failed", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(400, "invalid_catalog_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "catalog_file_storage_failed", str(exc)) from exc
