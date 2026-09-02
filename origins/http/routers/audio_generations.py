"""Temporary generated-audio candidates and explicit canonical Keep."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from origins.application.uploads import UploadError
from origins.composition.audio_generation import audio_generation_service
from origins.composition.workspaces import workspace_service
from origins.domain.uploads import FileCategory
from origins.http.audio_generation_contracts import (
    AudioGenerationCandidateEnvelope,
    AudioGenerationHistoryEnvelope,
    AudioGenerationStatusEnvelope,
    GeneratedDiscardEnvelope,
    GeneratedKeepEnvelope,
    SoundPresetCompileEnvelope,
    SoundPresetCompileRequest,
    SoundPresetTaxonomyEnvelope,
)
from origins.domain.sound_presets import compile_sound_preset
from origins.domain.sound_preset_taxonomy import TAXONOMY
from origins.http.errors import ApiProblem


router = APIRouter(
    prefix="/api/v1/audio-generations", tags=["audio-generations"])


class KeepGeneratedBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    category: FileCategory
    tags: list[str] = Field(default_factory=list, max_length=12)
    folder_id: int | None = Field(default=None, gt=0)


@router.get("/status", operation_id="getAudioGenerationStatus",
            response_model=AudioGenerationStatusEnvelope)
def audio_generation_status() -> dict:
    return {"data": audio_generation_service.status()}


@router.get("/preset/taxonomy", operation_id="getSoundPresetTaxonomy",
            response_model=SoundPresetTaxonomyEnvelope)
def sound_preset_taxonomy() -> dict:
    return {"data": TAXONOMY}


@router.post("/preset/compile", operation_id="compileSoundPreset",
             response_model=SoundPresetCompileEnvelope)
def compile_preset(payload: SoundPresetCompileRequest) -> dict:
    try:
        compiled = compile_sound_preset(
            payload.capability, payload.semantic_state,
            payload.source_free_text, payload.final_prompt_override)
    except ValueError as exc:
        raise ApiProblem(400, "invalid_sound_preset", str(exc)) from exc
    return {"data": compiled.as_dict()}


@router.get("/recent", operation_id="listRecentAudioGenerations",
            response_model=AudioGenerationHistoryEnvelope)
def recent_audio_generations(
    project_id: int | None = None, workspace_id: int | None = None,
) -> dict:
    if (project_id is None) == (workspace_id is None):
        raise ApiProblem(
            400, "invalid_creation_context",
            "Choose exactly one Workspace or audiovisual Project.")
    if project_id is not None and project_id <= 0:
        raise ApiProblem(400, "invalid_project", "Choose an audiovisual Project.")
    if workspace_id is not None and workspace_id <= 0:
        raise ApiProblem(400, "invalid_space", "Choose a Workspace.")
    return {"data": audio_generation_service.recent(
        project_id, workspace_id=workspace_id)}


def _candidate(candidate_id: UUID) -> tuple[dict, Path]:
    try:
        job, path = audio_generation_service.candidate(candidate_id)
        return job.result, path
    except LookupError as exc:
        raise ApiProblem(404, "generated_candidate_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiProblem(409, "generated_candidate_not_ready", str(exc)) from exc


@router.get("/{candidate_id}", operation_id="getAudioGenerationCandidate",
            response_model=AudioGenerationCandidateEnvelope)
def get_generated_candidate(candidate_id: UUID) -> dict:
    result, _ = _candidate(candidate_id)
    return {"data": result}


@router.get("/{candidate_id}/candidate",
            operation_id="playAudioGenerationCandidate",
            response_class=FileResponse)
def play_generated_candidate(candidate_id: UUID) -> FileResponse:
    _, path = _candidate(candidate_id)
    return FileResponse(
        path, media_type="audio/wav", filename=f"generated-{candidate_id}.wav")


@router.post(
    "/{candidate_id}/workspaces/{workspace_id}/keep",
    operation_id="keepGeneratedAudioFileInWorkspace",
    status_code=201,
    response_model=GeneratedKeepEnvelope,
)
def keep_generated_audio_in_workspace(
    candidate_id: UUID, workspace_id: int, payload: KeepGeneratedBody,
) -> dict:
    try:
        return {"data": audio_generation_service.keep(
            candidate_id=candidate_id, workspace_id=workspace_id,
            name=payload.name, category=payload.category,
            tags=tuple(payload.tags), folder_id=payload.folder_id)}
    except LookupError as exc:
        raise ApiProblem(404, "generated_candidate_not_found", str(exc)) from exc
    except (UploadError, ValueError) as exc:
        raise ApiProblem(400, "invalid_generated_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "generated_file_storage_failed", str(exc)) from exc


@router.post(
    "/{candidate_id}/projects/{project_id}/keep",
    operation_id="keepGeneratedAudioFileInAudiovisualProject",
    status_code=201,
    response_model=GeneratedKeepEnvelope,
)
def keep_generated_audio_in_audiovisual_project(
    candidate_id: UUID, project_id: int, payload: KeepGeneratedBody,
) -> dict:
    project = workspace_service.project(str(project_id))
    if not project:
        raise ApiProblem(404, "project_not_found",
                         "Audiovisual Project not found.")
    try:
        result = audio_generation_service.keep(
            candidate_id=candidate_id, workspace_id=project["workspace_id"],
            name=payload.name, category=payload.category,
            tags=tuple(payload.tags), folder_id=project.get("folder_id"))
        if not workspace_service.attach_file(
                project_id, result["file"]["id"], "audio"):
            raise RuntimeError("The File could not be associated with this Project.")
        return {"data": result}
    except LookupError as exc:
        raise ApiProblem(404, "generated_candidate_not_found", str(exc)) from exc
    except (UploadError, ValueError) as exc:
        raise ApiProblem(400, "invalid_generated_file", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(503, "generated_file_storage_failed", str(exc)) from exc


@router.delete("/{candidate_id}/candidate",
               operation_id="discardAudioGenerationCandidate",
               response_model=GeneratedDiscardEnvelope)
def discard_generated_candidate(candidate_id: UUID) -> dict:
    try:
        return {"data": {
            "discarded": audio_generation_service.discard(candidate_id)}}
    except LookupError as exc:
        raise ApiProblem(404, "generated_candidate_not_found", str(exc)) from exc
