"""Workspace-owned saved Composer references."""

from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from origins.composition.saved_references import saved_reference_service
from origins.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["saved-references"])


class SavedReferenceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["character", "object", "place", "style", "other"]
    file_ids: list[int] = Field(min_length=1, max_length=12)


class SavedReferenceResponse(BaseModel):
    id: str
    name: str
    type: Literal["character", "object", "place", "style", "other"]
    file_ids: list[int]
    created_at: str
    updated_at: str


class SavedReferenceEnvelope(BaseModel):
    data: SavedReferenceResponse


class SavedReferenceListEnvelope(BaseModel):
    data: list[SavedReferenceResponse]


@router.get(
    "/workspaces/{workspace_id}/saved-references",
    response_model=SavedReferenceListEnvelope,
    operation_id="listWorkspaceSavedReferences",
)
def list_workspace_saved_references(workspace_id: int) -> dict:
    return {"data": saved_reference_service.list(workspace_id)}


@router.post(
    "/workspaces/{workspace_id}/saved-references",
    response_model=SavedReferenceEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createWorkspaceSavedReference",
)
def create_workspace_saved_reference(
    workspace_id: int, payload: SavedReferenceCreate,
) -> dict:
    try:
        created = saved_reference_service.create(
            workspace_id, name=payload.name, reference_type=payload.type,
            file_ids=payload.file_ids)
    except ValueError as problem:
        raise ApiProblem(422, "invalid_saved_reference", str(problem)) from problem
    if not created:
        raise ApiProblem(404, "workspace_not_found", "That Workspace was not found.")
    return {"data": created}


@router.delete(
    "/workspaces/{workspace_id}/saved-references/{reference_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteWorkspaceSavedReference",
)
def delete_workspace_saved_reference(workspace_id: int, reference_id: str) -> None:
    if not saved_reference_service.delete(workspace_id, reference_id):
        raise ApiProblem(404, "saved_reference_not_found",
                         "That saved reference was not found.")
