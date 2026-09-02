"""Versioned Project import validation and durable execution."""

from uuid import uuid4

from fastapi import APIRouter, Header

from origins.application.project_import import summarize_document
from origins.composition.jobs import job_service
from origins.composition.workspaces import workspace_service
from origins.http.errors import ApiProblem
from origins.http.project_import_contracts import (
    ProjectImportExecuteBody,
    ProjectImportValidationBody,
    ProjectImportValidationEnvelope,
)
from origins.http.routers.jobs import JobCreatedEnvelope, _payload


router = APIRouter(prefix="/api/v1/project-imports",
                   tags=["project-imports"])


@router.post("/validate", operation_id="validateProjectImport",
             response_model=ProjectImportValidationEnvelope,
             response_model_exclude_none=True)
def validate_import(payload: ProjectImportValidationBody) -> dict:
    document = payload.document.model_dump(
        by_alias=True, exclude_none=True, mode="json")
    return {"data": {
        "document": document,
        "summary": summarize_document(document),
    }}


@router.post("", operation_id="createProjectImport", status_code=202,
             response_model=JobCreatedEnvelope)
def create_import(
    payload: ProjectImportExecuteBody,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    values = payload.model_dump(
        by_alias=True, exclude_none=True, mode="json")
    destination = values["destination"]
    project_id = (destination.get("project_id")
                     if destination.get("kind") == "existing" else None)
    if project_id is not None:
        project = workspace_service.project(str(project_id))
        if not project:
            raise ApiProblem(404, "project_not_found", "Project not found.")
        workspace_id = int(project["workspace_id"])
    else:
        workspace_id = int(destination["workspace_id"])
        if not workspace_service.overview(workspace_id):
            raise ApiProblem(404, "workspace_not_found", "Workspace not found.")
    try:
        job, created = job_service.enqueue(
            "project_import", values,
            idempotency_key=(idempotency_key
                             or f"project-import-{uuid4()}")[:200],
            project_id=project_id,
            workspace_id=workspace_id,
            creation_action_id="import-project",
            creation_context={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "project_type": "audiovisual",
                "folder_id": destination.get("folder_id"),
            },
            source_tool="project-import",
            operation_label="Import and prepare Project",
        )
    except ValueError as exc:
        raise ApiProblem(400, "invalid_project_import", str(exc)) from exc
    return {"data": _payload(job), "meta": {"created": created}}
