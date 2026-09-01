"""Space-owned saved Director references and the retiring Work routes."""

from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from audio_studio.composition.saved_references import saved_reference_service
from audio_studio.http.errors import ApiProblem


router = APIRouter(prefix="/api/v1", tags=["saved-references"])


class SavedReferenceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["character", "object", "place", "style", "other"]
    asset_ids: list[int] = Field(min_length=1, max_length=12)


class SavedReferenceResponse(BaseModel):
    id: str
    name: str
    type: Literal["character", "object", "place", "style", "other"]
    asset_ids: list[int]
    created_at: str
    updated_at: str


class SavedReferenceEnvelope(BaseModel):
    data: SavedReferenceResponse


class SavedReferenceListEnvelope(BaseModel):
    data: list[SavedReferenceResponse]


@router.get(
    "/ventures/{venture_id}/saved-references",
    response_model=SavedReferenceListEnvelope,
    operation_id="listSavedReferences",
)
def list_saved_references(venture_id: int) -> dict:
    return {"data": saved_reference_service.list(venture_id)}


@router.post(
    "/ventures/{venture_id}/saved-references",
    response_model=SavedReferenceEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSavedReference",
)
def create_saved_reference(
    venture_id: int, payload: SavedReferenceCreate,
) -> dict:
    try:
        created = saved_reference_service.create(
            venture_id, name=payload.name, reference_type=payload.type,
            asset_ids=payload.asset_ids,
        )
    except ValueError as problem:
        raise ApiProblem(422, "invalid_saved_reference", str(problem)) from problem
    if not created:
        raise ApiProblem(404, "venture_not_found", "That Venture was not found.")
    return {"data": created}


@router.delete(
    "/ventures/{venture_id}/saved-references/{reference_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteSavedReference",
)
def delete_saved_reference(venture_id: int, reference_id: str) -> None:
    if not saved_reference_service.delete(venture_id, reference_id):
        raise ApiProblem(404, "saved_reference_not_found",
                         "That saved reference was not found.")


@router.get(
    "/spaces/{space_id}/saved-references",
    response_model=SavedReferenceListEnvelope,
    operation_id="listSpaceSavedReferences",
)
def list_space_saved_references(space_id: int) -> dict:
    return {"data": saved_reference_service.list_space(space_id)}


@router.post(
    "/spaces/{space_id}/saved-references",
    response_model=SavedReferenceEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSpaceSavedReference",
)
def create_space_saved_reference(
    space_id: int, payload: SavedReferenceCreate,
) -> dict:
    try:
        created = saved_reference_service.create_space(
            space_id, name=payload.name, reference_type=payload.type,
            asset_ids=payload.asset_ids)
    except ValueError as problem:
        raise ApiProblem(422, "invalid_saved_reference", str(problem)) from problem
    if not created:
        raise ApiProblem(404, "space_not_found", "That Space was not found.")
    return {"data": created}


@router.delete(
    "/spaces/{space_id}/saved-references/{reference_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteSpaceSavedReference",
)
def delete_space_saved_reference(space_id: int, reference_id: str) -> None:
    if not saved_reference_service.delete_space(space_id, reference_id):
        raise ApiProblem(404, "saved_reference_not_found",
                         "That saved reference was not found.")
