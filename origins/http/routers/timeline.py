"""Native Project timeline API."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from origins.application.timeline import TimelineConflict, TimelineError
from origins.domain.speech import DEFAULT_SPEECH_VOLUME
from origins.composition.timeline import timeline_service
from origins.http.errors import ApiProblem
from origins.http.project_import_contracts import ProjectImportBody
from origins.http.timeline_contracts import (
    DeletedPartsEnvelope,
    MovedPartsEnvelope,
    OkEnvelope,
    PartCreatedEnvelope,
    TranscriptSummaryListEnvelope,
)
from origins.http.project_import_contracts import ProjectImportEnvelope


router = APIRouter(prefix="/api/v1/projects/{project_id}", tags=["timeline"])


class OrderBody(BaseModel):
    order: list[int]


class SilenceBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seconds: float = Field(ge=.1, le=120)
    insert_before_part_id: str | None = None


class EnabledBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class FileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: int = Field(gt=0)
    insert_before_part_id: str | None = None


class ReplaceFileBody(BaseModel):
    file_id: int = Field(gt=0)


class DraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str = "raw"
    spoken_profile: Literal["spoken_1", "spoken_2"] = "spoken_1"
    insert_before_part_id: str | None = None
    authored_role: str | None = Field(default=None, max_length=120)
    voice_identity_id: str | None = None
    binding_id: str | None = None
    catalogue_voice_id: str | None = None
    capability_id: str | None = None
    format: str = "mp3"
    language: str = "Auto"
    instruction: str = ""
    speech_mode: str = "exact"
    rate: float = 1
    pitch: float = 1
    volume: int = DEFAULT_SPEECH_VOLUME
    seed: int = 0
    enable_ssml: bool = False
    confirmed: bool = False


class MoveBody(BaseModel):
    ids: list[int]
    destination_project_id: int = Field(gt=0)


class DeleteBody(BaseModel):
    ids: list[int]


class TextBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = None
    text_raw: str | None = None
    text_shaped: str | None = None
    text_tagged: str | None = None
    text_state: str | None = None


class EditorialBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    script: str | None = None
    authored_role: str | None = Field(default=None, max_length=120)


def _run(operation):
    try:
        return {"data": operation()}
    except TimelineConflict as exc:
        raise ApiProblem(409, "part_revision_conflict", str(exc), {
            "current_revision": exc.current_revision,
        }) from exc
    except TimelineError as exc:
        raise ApiProblem(400, "timeline_error", str(exc)) from exc


@router.post("/parts/reorder", operation_id="reorderProjectParts",
             response_model=OkEnvelope)
def reorder_parts(project_id: int, payload: OrderBody) -> dict:
    return _run(lambda: {
        "ok": timeline_service.reorder(project_id, payload.order)})


@router.patch("/parts/{part_id}/enabled",
              operation_id="updateProjectPartEnabled",
              response_model=OkEnvelope)
def update_part_enabled(
    project_id: int, part_id: int, payload: EnabledBody,
) -> dict:
    return _run(lambda: timeline_service.set_enabled(
        project_id, part_id, payload.enabled))


@router.post("/parts/silence", operation_id="addProjectSilence",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def add_silence(project_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline_service.add_silence(
        project_id, payload.seconds, payload.insert_before_part_id))


@router.post("/parts/drafts", operation_id="addProjectDraft",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def add_draft(project_id: int, payload: DraftBody) -> dict:
    return _run(lambda: timeline_service.add_draft(
        project_id, payload.model_dump()))


@router.post("/import", operation_id="importProjectDocument",
             response_model=ProjectImportEnvelope)
def import_project(
    project_id: int, payload: ProjectImportBody,
) -> dict:
    return _run(lambda: timeline_service.import_document(
        project_id, payload.document.model_dump(
            by_alias=True, exclude_none=True),
        payload.role_voices))


@router.patch("/parts/{part_id}/silence", operation_id="updateProjectSilence",
              response_model=PartCreatedEnvelope,
              response_model_exclude_none=True)
def update_silence(project_id: int, part_id: int, payload: SilenceBody) -> dict:
    return _run(lambda: timeline_service.edit_silence(
        project_id, part_id, payload.seconds))


@router.post("/parts/files", operation_id="insertProjectFile",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def insert_file(project_id: int, payload: FileBody) -> dict:
    return _run(lambda: timeline_service.insert_file(
        project_id, payload.file_id, payload.insert_before_part_id))


@router.patch("/parts/{part_id}/file", operation_id="replaceProjectFile",
              response_model=PartCreatedEnvelope,
              response_model_exclude_none=True)
def replace_file(project_id: int, part_id: int,
                  payload: ReplaceFileBody) -> dict:
    return _run(lambda: timeline_service.replace_file(
        project_id, part_id, payload.file_id))


@router.post("/parts/{part_id}/duplicate", operation_id="duplicateProjectPart",
             response_model=PartCreatedEnvelope,
             response_model_exclude_none=True)
def duplicate_part(project_id: int, part_id: int) -> dict:
    return _run(lambda: timeline_service.duplicate(project_id, part_id))


@router.delete("/parts", operation_id="deleteProjectParts",
               response_model=DeletedPartsEnvelope)
def delete_parts(project_id: int, payload: DeleteBody) -> dict:
    return _run(lambda: timeline_service.delete_parts(project_id, payload.ids))


@router.post("/parts/move", operation_id="moveProjectParts",
             response_model=MovedPartsEnvelope)
def move_parts(project_id: int, payload: MoveBody) -> dict:
    return _run(lambda: timeline_service.move_parts(
        project_id, payload.ids, payload.destination_project_id))


@router.patch("/parts/{part_id}/draft", operation_id="updateProjectPartDraft",
              response_model=OkEnvelope)
def update_part_text(project_id: int, part_id: int, payload: TextBody) -> dict:
    return _run(lambda: timeline_service.save_draft(
        project_id, part_id, payload.model_dump(exclude_none=False)))


@router.patch("/parts/{part_id}/editorial", operation_id="updateProjectPartEditorial",
              response_model=OkEnvelope)
def update_part_editorial(project_id: int, part_id: int,
                          payload: EditorialBody) -> dict:
    values = payload.model_dump(exclude_unset=True)
    expected_revision = int(values.pop("expected_revision"))
    return _run(lambda: timeline_service.save_editorial(
        project_id, part_id, expected_revision, values))


@router.get("/parts/{part_id}/captions", operation_id="listProjectPartCaptions",
            response_model=TranscriptSummaryListEnvelope)
def list_part_captions(project_id: int, part_id: int) -> dict:
    return _run(lambda: timeline_service.captions(project_id, part_id))
