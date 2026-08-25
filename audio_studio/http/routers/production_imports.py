"""Versioned Production import validation and durable execution."""

from uuid import uuid4

from fastapi import APIRouter, Header

from audio_studio.application.production_import import summarize_document
from audio_studio.composition.jobs import job_service
from audio_studio.http.errors import ApiProblem
from audio_studio.http.production_import_contracts import (
    ProductionImportExecuteBody,
    ProductionImportValidationBody,
    ProductionImportValidationEnvelope,
)
from audio_studio.http.routers.jobs import JobCreatedEnvelope, _payload


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
    try:
        job, created = job_service.enqueue(
            "production_import", values,
            idempotency_key=(idempotency_key
                             or f"production-import-{uuid4()}")[:200],
            production_id=production_id,
            source_tool="production",
            operation_label="Import and prepare Production",
        )
    except ValueError as exc:
        raise ApiProblem(400, "invalid_production_import", str(exc)) from exc
    return {"data": _payload(job), "meta": {"created": created}}
