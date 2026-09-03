"""Workspace-owned Project grouping routes."""

from fastapi import APIRouter, status

from origins.composition.projects import project_service
from origins.domain.work import DomainValidation
from origins.http.errors import ApiProblem
from origins.http.workspace_contracts import (
    ProjectCreateRequest,
    ProjectDeletedEnvelope,
    ProjectDetailEnvelope,
    ProjectListEnvelope,
    ProjectMutationEnvelope,
    ProjectUpdateRequest,
)


router = APIRouter(prefix="/api/v1", tags=["Projects"])


@router.get(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectListEnvelope,
    operation_id="listProjects",
)
def list_projects(workspace_id: int) -> dict:
    return {"data": project_service.list_for_workspace(workspace_id)}


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectMutationEnvelope,
    status_code=status.HTTP_201_CREATED,
    operation_id="createProject",
)
def create_project(workspace_id: int, payload: ProjectCreateRequest) -> dict:
    try:
        project = project_service.create(
            workspace_id, payload.name, payload.description, payload.folder_id)
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_project", str(exc)) from exc
    if not project:
        raise ApiProblem(404, "workspace_or_folder_not_found",
                         "Workspace or Folder not found.")
    return {"data": project}


@router.get(
    "/projects/{project_identifier}",
    response_model=ProjectDetailEnvelope,
    operation_id="getProject",
)
def get_project(project_identifier: str) -> dict:
    project = project_service.project(project_identifier)
    if not project:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": project}


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectMutationEnvelope,
    operation_id="updateProject",
)
def update_project(project_id: int, payload: ProjectUpdateRequest) -> dict:
    try:
        project = project_service.update(project_id, payload.changes())
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_project", str(exc)) from exc
    if not project:
        raise ApiProblem(404, "project_or_folder_not_found",
                         "Project or Folder not found in this Workspace.")
    return {"data": project}


@router.delete(
    "/projects/{project_id}",
    response_model=ProjectDeletedEnvelope,
    operation_id="deleteProject",
)
def delete_project(project_id: int) -> dict:
    deleted = project_service.delete(project_id)
    if not deleted:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": deleted}
