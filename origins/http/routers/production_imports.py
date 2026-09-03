"""Versioned Production import validation and durable execution."""

from uuid import uuid4

from fastapi import APIRouter, Header

from origins.application.production_import import summarize_document
from origins.composition.jobs import job_service
from origins.composition.workspaces import workspace_service
from origins.http.errors import ApiProblem
from origins.http.production_import_contracts import (
    ProductionImportExecuteBody,
    ProductionImportValidationBody,
    ProductionImportValidationEnvelope,
)
from origins.http.routers.jobs import JobCreatedEnvelope, _payload


router = APIRouter(prefix="/api/v1/production-imports",
                   tags=["production-imports"])


@router.post("/validate", operation_id="validateProductionImport",
             response_model=ProductionImportValidationEnvelope,
             response_model_exclude_none=True)
def validate_import(payload: ProductionImportValidationBody) -> dict:
    document = payload.document.model_dump(
        by_alias=True, exclude_none=True, mode="json")
    return {"data": {
        "document": document,
        "summary": summarize_document(document),
    }}


@router.post("", operation_id="createProductionImport", status_code=202,
             response_model=JobCreatedEnvelope)
def create_import(
    payload: ProductionImportExecuteBody,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    values = payload.model_dump(
        by_alias=True, exclude_none=True, mode="json")
    destination = values["destination"]
    production_id = (destination.get("production_id")
                     if destination.get("kind") == "existing" else None)
    if production_id is not None:
        production = workspace_service.production(str(production_id))
        if not production:
            raise ApiProblem(404, "production_not_found", "Production not found.")
        workspace_id = int(production["workspace_id"])
    else:
        workspace_id = int(destination["workspace_id"])
        if not workspace_service.overview(workspace_id):
            raise ApiProblem(404, "workspace_not_found", "Workspace not found.")
    try:
        job, created = job_service.enqueue(
            "production_import", values,
            idempotency_key=(idempotency_key
                             or f"production-import-{uuid4()}")[:200],
            production_id=production_id,
            workspace_id=workspace_id,
            creation_action_id="import-production",
            creation_context={
                "workspace_id": workspace_id,
                "production_id": production_id,
                "production_type": "audiovisual",
                "folder_id": destination.get("folder_id"),
            },
            source_tool="production-import",
            operation_label="Import and prepare Production",
        )
    except ValueError as exc:
        raise ApiProblem(400, "invalid_production_import", str(exc)) from exc
    return {"data": _payload(job), "meta": {"created": created}}
