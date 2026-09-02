"""Audiovisual Project read model and Project-scoped File usage routes."""

from fastapi import APIRouter

from origins.composition.projects import project_service
from origins.domain.work import DomainConflict, DomainValidation
from origins.http.contracts import ResourceUpdate
from origins.http.errors import ApiProblem
from origins.http.project_contracts import (
    ArchivedResourceEnvelope,
    ProjectEditorEnvelope,
    ProjectFileLibraryEnvelope,
    LibraryFileMutationEnvelope,
    LibraryFileMutationRequest,
)
from origins.http.workspace_contracts import ProjectMutationEnvelope


router = APIRouter(prefix="/api/v1", tags=["Projects"])


@router.get(
    "/projects/{project_id}/editor",
    operation_id="getAudiovisualProjectEditor",
    response_model=ProjectEditorEnvelope,
)
def get_project_editor(project_id: str) -> dict:
    item = project_service.project_editor(project_id)
    if not item:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": item}


@router.get(
    "/projects/{project_id}/files",
    operation_id="listProjectFiles",
    response_model=ProjectFileLibraryEnvelope,
)
def list_project_files(project_id: str) -> dict:
    item = project_service.project_file_usages(project_id)
    if not item:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": item}


@router.post(
    "/projects/{project_id}/library-files",
    operation_id="attachProjectLibraryFile",
    response_model=LibraryFileMutationEnvelope,
)
def attach_project_library_file(
    project_id: str, payload: LibraryFileMutationRequest,
) -> dict:
    try:
        result = project_service.attach_library_file(project_id, payload.file_id)
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_library_file", str(exc)) from exc
    if not result:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": result}


@router.delete(
    "/projects/{project_id}/library-files/{file_id}",
    operation_id="detachProjectLibraryFile",
    response_model=LibraryFileMutationEnvelope,
)
def detach_project_library_file(project_id: str, file_id: int) -> dict:
    result = project_service.detach_library_file(project_id, file_id)
    if not result:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": result}


@router.patch(
    "/projects/{project_id}", operation_id="updateProject",
    response_model=ProjectMutationEnvelope,
)
def update_project(project_id: int, payload: ResourceUpdate) -> dict:
    try:
        updated = project_service.update_project(project_id, payload.changes())
    except DomainConflict as exc:
        raise ApiProblem(409, "project_conflict", str(exc)) from exc
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_project", str(exc)) from exc
    if not updated:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": updated}


@router.delete(
    "/projects/{project_id}", operation_id="deleteProject",
    response_model=ArchivedResourceEnvelope,
)
def delete_project(project_id: int) -> dict:
    removed = project_service.delete_project(project_id)
    if not removed:
        raise ApiProblem(404, "project_not_found", "That Project does not exist.")
    return {"data": removed}
