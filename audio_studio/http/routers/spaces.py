"""Space-first routes and the read-only Create catalogue."""

from fastapi import APIRouter, HTTPException, Query, status

from audio_studio.composition.creation import creation_registry
from audio_studio.composition.spaces import space_service
from audio_studio.http.space_contracts import (
    AudiovisualProjectCreateRequest,
    CreationActionListEnvelope,
    FolderCreateRequest,
    FolderMutationEnvelope,
    ProjectMutationEnvelope,
    SpaceCreateRequest,
    SpaceListEnvelope,
    SpaceMutationEnvelope,
    SpaceOverviewEnvelope,
)


router = APIRouter(prefix="/api/v1", tags=["Spaces"])


@router.get("/spaces", response_model=SpaceListEnvelope,
            operation_id="listSpaces")
def list_spaces() -> dict:
    return {"data": space_service.list_spaces()}


@router.get("/spaces/{space_id}", response_model=SpaceOverviewEnvelope,
            operation_id="getSpace")
def get_space(space_id: int) -> dict:
    overview = space_service.overview(space_id)
    if not overview:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Space not found.")
    return {"data": overview}


@router.post("/spaces", response_model=SpaceMutationEnvelope,
             status_code=status.HTTP_201_CREATED, operation_id="createSpace")
def create_space(payload: SpaceCreateRequest) -> dict:
    return {"data": space_service.create_space(
        payload.name, payload.description)}


@router.post("/spaces/{space_id}/folders", response_model=FolderMutationEnvelope,
             status_code=status.HTTP_201_CREATED, operation_id="createFolder")
def create_folder(space_id: int, payload: FolderCreateRequest) -> dict:
    folder = space_service.create_folder(
        space_id, payload.name, payload.parent_id)
    if not folder:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Space or parent Folder not found.")
    return {"data": folder}


@router.post(
    "/spaces/{space_id}/projects/audiovisual",
    response_model=ProjectMutationEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createAudiovisualProject",
)
def create_audiovisual_project(
    space_id: int, payload: AudiovisualProjectCreateRequest,
) -> dict:
    project = space_service.create_audiovisual_project(
        space_id, payload.name, payload.description, payload.folder_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Space or Folder not found.")
    return {"data": project}


@router.get("/creation-actions", response_model=CreationActionListEnvelope,
            operation_id="listCreationActions")
def list_creation_actions(
    context: str = Query(default="space", max_length=120),
) -> dict:
    return {"data": [{
        "id": action.id,
        "label": action.label,
        "description": action.description,
        "inputs": [{
            "id": field.id, "label": field.label, "type": field.type,
            "required": field.required, "choices": list(field.choices),
        } for field in action.inputs],
        "parameters": [{
            "id": field.id, "label": field.label, "type": field.type,
            "required": field.required, "choices": list(field.choices),
        } for field in action.parameters],
        "output_mime_types": list(action.output_mime_types),
        "supported_contexts": list(action.supported_contexts),
        "composer": action.composer,
    } for action in creation_registry.actions(context)]}
