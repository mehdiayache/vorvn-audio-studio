"""Workspace-first routes and the read-only Create catalogue."""

from fastapi import APIRouter, HTTPException, Query, status

from origins.composition.creation import creation_registry
from origins.composition.workspaces import workspace_service
from origins.http.workspace_contracts import (
    AudiovisualProductionCreateRequest,
    CreationActionListEnvelope,
    FolderCreateRequest,
    FolderMutationEnvelope,
    ProductionMutationEnvelope,
    WorkspaceCreateRequest,
    WorkspaceListEnvelope,
    WorkspaceMutationEnvelope,
    WorkspaceOverviewEnvelope,
)


router = APIRouter(prefix="/api/v1", tags=["Workspaces"])


@router.get("/workspaces", response_model=WorkspaceListEnvelope,
            operation_id="listWorkspaces")
def list_workspaces() -> dict:
    return {"data": workspace_service.list_workspaces()}


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOverviewEnvelope,
            operation_id="getWorkspace")
def get_workspace(workspace_id: int) -> dict:
    overview = workspace_service.overview(workspace_id)
    if not overview:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found.")
    return {"data": overview}


@router.post("/workspaces", response_model=WorkspaceMutationEnvelope,
             status_code=status.HTTP_201_CREATED, operation_id="createWorkspace")
def create_workspace(payload: WorkspaceCreateRequest) -> dict:
    return {"data": workspace_service.create_workspace(
        payload.name, payload.description)}


@router.post("/workspaces/{workspace_id}/folders", response_model=FolderMutationEnvelope,
             status_code=status.HTTP_201_CREATED, operation_id="createFolder")
def create_folder(workspace_id: int, payload: FolderCreateRequest) -> dict:
    folder = workspace_service.create_folder(
        workspace_id, payload.name, payload.parent_id, payload.project_id)
    if not folder:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Workspace or parent Folder not found.")
    return {"data": folder}


@router.post(
    "/workspaces/{workspace_id}/productions/audiovisual",
    response_model=ProductionMutationEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createAudiovisualProduction",
)
def create_audiovisual_production(
    workspace_id: int, payload: AudiovisualProductionCreateRequest,
) -> dict:
    production = workspace_service.create_audiovisual_production(
        workspace_id, payload.name, payload.description, payload.folder_id,
        payload.project_id)
    if not production:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Workspace or Folder not found.")
    return {"data": production}


@router.get(
    "/productions/{production_identifier}",
    response_model=ProductionMutationEnvelope,
    operation_id="getAudiovisualProduction",
)
def get_audiovisual_production(production_identifier: str) -> dict:
    production = workspace_service.production(production_identifier)
    if not production:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Audiovisual Production not found.")
    return {"data": production}


@router.get("/creation-actions", response_model=CreationActionListEnvelope,
            operation_id="listCreationActions")
def list_creation_actions(
    context: str = Query(default="workspace", max_length=120),
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
        "capability_id": action.capability_id,
    } for action in creation_registry.actions(context)]}
