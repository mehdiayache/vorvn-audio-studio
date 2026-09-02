"""Workspace-first routes and the read-only Create catalogue."""

from fastapi import APIRouter, HTTPException, Query, status

from origins.composition.creation import creation_registry
from origins.composition.workspaces import workspace_service
from origins.http.workspace_contracts import (
    AudiovisualProjectCreateRequest,
    CreationActionListEnvelope,
    FolderCreateRequest,
    FolderMutationEnvelope,
    ProjectMutationEnvelope,
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
        workspace_id, payload.name, payload.parent_id)
    if not folder:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Workspace or parent Folder not found.")
    return {"data": folder}


@router.post(
    "/workspaces/{workspace_id}/projects/audiovisual",
    response_model=ProjectMutationEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createAudiovisualProject",
)
def create_audiovisual_project(
    workspace_id: int, payload: AudiovisualProjectCreateRequest,
) -> dict:
    project = workspace_service.create_audiovisual_project(
        workspace_id, payload.name, payload.description, payload.folder_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Workspace or Folder not found.")
    return {"data": project}


@router.get(
    "/projects/{project_identifier}",
    response_model=ProjectMutationEnvelope,
    operation_id="getAudiovisualProject",
)
def get_audiovisual_project(project_identifier: str) -> dict:
    project = workspace_service.project(project_identifier)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Audiovisual Project not found.")
    return {"data": project}


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
