"""Audiovisual Production read model and Production-scoped File usage routes."""

from fastapi import APIRouter

from origins.composition.productions import production_service
from origins.domain.work import DomainConflict, DomainValidation
from origins.http.contracts import ResourceUpdate
from origins.http.errors import ApiProblem
from origins.http.production_contracts import (
    ArchivedResourceEnvelope,
    ProductionEditorEnvelope,
    ProductionFileLibraryEnvelope,
    LibraryFileMutationEnvelope,
    LibraryFileMutationRequest,
)
from origins.http.workspace_contracts import ProductionMutationEnvelope


router = APIRouter(prefix="/api/v1", tags=["Productions"])


@router.get(
    "/productions/{production_id}/editor",
    operation_id="getAudiovisualProductionEditor",
    response_model=ProductionEditorEnvelope,
)
def get_production_editor(production_id: str) -> dict:
    item = production_service.production_editor(production_id)
    if not item:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": item}


@router.get(
    "/productions/{production_id}/files",
    operation_id="listProductionFiles",
    response_model=ProductionFileLibraryEnvelope,
)
def list_production_files(production_id: str) -> dict:
    item = production_service.production_file_usages(production_id)
    if not item:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": item}


@router.post(
    "/productions/{production_id}/library-files",
    operation_id="attachProductionLibraryFile",
    response_model=LibraryFileMutationEnvelope,
)
def attach_production_library_file(
    production_id: str, payload: LibraryFileMutationRequest,
) -> dict:
    try:
        result = production_service.attach_library_file(production_id, payload.file_id)
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_library_file", str(exc)) from exc
    if not result:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": result}


@router.delete(
    "/productions/{production_id}/library-files/{file_id}",
    operation_id="detachProductionLibraryFile",
    response_model=LibraryFileMutationEnvelope,
)
def detach_production_library_file(production_id: str, file_id: int) -> dict:
    result = production_service.detach_library_file(production_id, file_id)
    if not result:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": result}


@router.patch(
    "/productions/{production_id}", operation_id="updateProduction",
    response_model=ProductionMutationEnvelope,
)
def update_production(production_id: int, payload: ResourceUpdate) -> dict:
    try:
        updated = production_service.update_production(production_id, payload.changes())
    except DomainConflict as exc:
        raise ApiProblem(409, "production_conflict", str(exc)) from exc
    except DomainValidation as exc:
        raise ApiProblem(400, "invalid_production", str(exc)) from exc
    if not updated:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": updated}


@router.delete(
    "/productions/{production_id}", operation_id="deleteProduction",
    response_model=ArchivedResourceEnvelope,
)
def delete_production(production_id: int) -> dict:
    removed = production_service.delete_production(production_id)
    if not removed:
        raise ApiProblem(404, "production_not_found", "That Production does not exist.")
    return {"data": removed}
