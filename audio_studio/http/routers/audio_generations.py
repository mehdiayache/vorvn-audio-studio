"""Temporary generated-audio candidates and explicit canonical Keep."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from audio_studio.application.uploads import UploadError
from audio_studio.composition.audio_generation import audio_generation_service
from audio_studio.domain.uploads import AssetCategory, AssetScope
from audio_studio.http.audio_generation_contracts import (
    AudioGenerationCandidateEnvelope,
    AudioGenerationHistoryEnvelope,
    AudioGenerationStatusEnvelope,
    GeneratedDiscardEnvelope,
    GeneratedKeepEnvelope,
    SoundRecipeCompileEnvelope,
    SoundRecipeCompileRequest,
    SoundRecipeTaxonomyEnvelope,
)
from audio_studio.domain.sound_recipes import compile_sound_recipe
from audio_studio.domain.sound_recipe_taxonomy import TAXONOMY
from audio_studio.http.errors import ApiProblem


router = APIRouter(
    prefix="/api/v1/audio-generations", tags=["audio-generations"])


class KeepGeneratedBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    collection_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=120)
    category: AssetCategory
    scope: AssetScope
    tags: list[str] = Field(default_factory=list, max_length=12)


@router.get("/status", operation_id="getAudioGenerationStatus",
            response_model=AudioGenerationStatusEnvelope)
def audio_generation_status() -> dict:
    return {"data": audio_generation_service.status()}


@router.get("/recipe/taxonomy", operation_id="getSoundRecipeTaxonomy",
            response_model=SoundRecipeTaxonomyEnvelope)
def sound_recipe_taxonomy() -> dict:
    return {"data": TAXONOMY}


@router.post("/recipe/compile", operation_id="compileSoundRecipe",
             response_model=SoundRecipeCompileEnvelope)
def compile_recipe(payload: SoundRecipeCompileRequest) -> dict:
    try:
        compiled = compile_sound_recipe(
            payload.capability, payload.semantic_state,
            payload.source_free_text, payload.final_prompt_override)
    except ValueError as exc:
        raise ApiProblem(400, "invalid_sound_recipe", str(exc)) from exc
    return {"data": compiled.as_dict()}


@router.get("/recent", operation_id="listRecentAudioGenerations",
            response_model=AudioGenerationHistoryEnvelope)
def recent_audio_generations(production_id: int) -> dict:
    if production_id <= 0:
        raise ApiProblem(400, "invalid_production", "Choose a Production.")
    return {"data": audio_generation_service.recent(production_id)}


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


@router.post("/{candidate_id}/keep", operation_id="keepGeneratedAudio",
             status_code=201, response_model=GeneratedKeepEnvelope)
def keep_generated_audio(candidate_id: UUID,
                         payload: KeepGeneratedBody) -> dict:
    try:
        result = audio_generation_service.keep(
            candidate_id=candidate_id, collection_id=payload.collection_id,
            name=payload.name, category=payload.category,
            scope=payload.scope, tags=tuple(payload.tags))
        return {"data": result}
    except LookupError as exc:
        raise ApiProblem(404, "generated_candidate_not_found", str(exc)) from exc
    except (UploadError, ValueError) as exc:
        raise ApiProblem(400, "invalid_generated_asset", str(exc)) from exc
    except RuntimeError as exc:
        raise ApiProblem(
            503, "generated_asset_storage_failed", str(exc)) from exc


@router.delete("/{candidate_id}/candidate",
               operation_id="discardAudioGenerationCandidate",
               response_model=GeneratedDiscardEnvelope)
def discard_generated_candidate(candidate_id: UUID) -> dict:
    try:
        return {"data": {
            "discarded": audio_generation_service.discard(candidate_id)}}
    except LookupError as exc:
        raise ApiProblem(404, "generated_candidate_not_found", str(exc)) from exc
