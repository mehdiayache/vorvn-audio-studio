"""Normalize only free Sound Recipe language before deterministic compilation."""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Any, Callable, Protocol

from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.application.text_preparation import (
    MODEL,
    PRICE_VERSION,
    estimate,
    usage_cost,
)
from audio_studio.domain.jobs import Job
from audio_studio.domain.sound_recipes import (
    LANGUAGE_NORMALIZATION_VERSION,
    RecipeCapability,
    compile_sound_recipe,
    language_source_sha256,
    normalize_recipe,
)
from audio_studio.domain.text import ProviderText


SYSTEM_PROMPT = """You normalize creative audio directions for a deterministic Sound Recipe compiler.

Translate and clarify only the supplied free text and custom values into concise natural English suitable for an audio-generation prompt. Preserve the operator's acoustic meaning. Do not add a genre, instrument, mood, event, setting, or production quality that was not requested. Do not rewrite known taxonomy selections; they are not included here.

Return strict JSON only in this exact shape:
{"brief_en":"...","custom_values":[{"id":"custom_1","canonical_en":"..."}]}

Keep every supplied custom id exactly once. An empty brief must remain empty. No markdown or commentary."""


class SoundRecipeTextProvider(Protocol):
    def complete(self, *, model: str, messages: list[dict[str, str]],
                 reasoning: bool = False) -> ProviderText: ...


class JobProgressRepository(Protocol):
    def progress(self, job_id: int, done: int, total: int,
                 detail: str = "") -> None: ...


def _custom_values(value: Any, path: tuple[str | int, ...] = ()) \
        -> list[tuple[str, tuple[str | int, ...], str]]:
    if isinstance(value, dict) and value.get("source") == "custom":
        display = " ".join(str(value.get("display") or "").split())[:120]
        return [("", path, display)] if display else []
    result: list[tuple[str, tuple[str | int, ...], str]] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            result.extend(_custom_values(nested, (*path, key)))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            result.extend(_custom_values(nested, (*path, index)))
    return result


def _replace_at_path(root: dict[str, Any], path: tuple[str | int, ...],
                     canonical: str) -> None:
    target: Any = root
    for part in path[:-1]:
        target = target[part]
    current = target[path[-1]]
    target[path[-1]] = {
        **current,
        "display": " ".join(str(current.get("display") or canonical).split())[:120],
        "canonical_en": " ".join(canonical.split())[:120],
        "source": "custom",
    }


def _canonical_at_path(root: dict[str, Any],
                       path: tuple[str | int, ...]) -> str:
    target: Any = root
    for part in path:
        target = target[part]
    if not isinstance(target, dict):
        return ""
    return " ".join(str(target.get("canonical_en") or "").split())[:120]


def _json_object(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        candidate = "\n".join(lines[1:-1]).strip()
        if candidate.casefold().startswith("json\n"):
            candidate = candidate[5:].strip()
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise ValueError(
            "The language normalizer returned an unreadable result. Try again.") from exc
    if not isinstance(parsed, dict):
        raise ValueError(
            "The language normalizer returned an unreadable result. Try again.")
    return parsed


class SoundRecipeNormalizationService:
    """Translate free language once; known recipe controls remain deterministic."""

    def __init__(self, provider: SoundRecipeTextProvider,
                 preferences: Callable[[], dict],
                 operations: ProviderOperationService):
        self.provider = provider
        self.preferences = preferences
        self.operations = operations

    def normalize(self, *, job_id: int, capability: RecipeCapability,
                  semantic_state: dict[str, Any], source_free_text: str,
                  confirmed: bool = False) -> dict[str, Any]:
        state = normalize_recipe(capability, semantic_state)
        original_brief = " ".join((source_free_text or state.get(
            "creative_brief") or "").split())[:2_000]
        state["creative_brief"] = original_brief
        custom = _custom_values(state)
        custom = [
            (f"custom_{index + 1}", path, display)
            for index, (_, path, display) in enumerate(custom)
        ]
        source_fingerprint = language_source_sha256(state, original_brief)
        already_normalized = (
            state.get("language_normalization_version")
            == LANGUAGE_NORMALIZATION_VERSION
            and state.get("language_source_sha256") == source_fingerprint
            and (not original_brief or bool(state.get("creative_brief_en")))
            and all(bool(_canonical_at_path(state, path))
                    for _, path, _ in custom)
        )
        if already_normalized:
            compiled = compile_sound_recipe(
                capability, state, original_brief)
            return {
                **compiled.as_dict(), "normalization_model": None,
                "normalization_cost": 0, "usage": {},
            }
        if not original_brief and not custom:
            compiled = compile_sound_recipe(
                capability, state, original_brief)
            return {
                **compiled.as_dict(), "normalization_model": None,
                "normalization_cost": 0, "usage": {},
            }

        request = {
            "capability": capability,
            "brief": original_brief,
            "custom_values": [
                {"id": identifier, "text": display}
                for identifier, _, display in custom
            ],
        }
        request_text = json.dumps(request, ensure_ascii=False,
                                  separators=(",", ":"))
        estimated = estimate(request_text + SYSTEM_PROMPT)
        preferences = self.preferences()
        reservation_id = self.operations.authorize(
            job_id, "sound_recipe_normalization", estimated,
            preferences, confirmed)
        attempt_id = self.operations.repository.begin_attempt(
            job_id, "sound_recipe_normalization", {
                "provider": "alibaba", "region": "intl", "model": MODEL,
            }, {
                "capability": capability,
                "input_sha256": hashlib.sha256(
                    request_text.encode("utf-8")).hexdigest(),
                "custom_value_count": len(custom),
            }, reservation_id)
        self.operations.repository.mark_sent(attempt_id)
        try:
            completion = self.provider.complete(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": request_text},
                ],
                reasoning=False,
            )
        except Exception as exc:
            status = self.operations.failure_status(exc)
            self.operations.repository.finish_attempt(
                attempt_id, status, cost=0, usage={}, request_ids=[],
                error={"type": type(exc).__name__, "message": str(exc)[:600]})
            raise

        actual = usage_cost(completion.usage)
        cost = actual if actual is not None else estimated
        try:
            parsed = _json_object(completion.text)
            brief_en = " ".join(str(parsed.get("brief_en") or "").split())[:500]
            if original_brief and not brief_en:
                raise ValueError(
                    "The language normalizer did not return the creative brief. Try again.")
            returned = parsed.get("custom_values")
            if not isinstance(returned, list):
                returned = []
            canonical_by_id = {
                str(item.get("id")): " ".join(str(
                    item.get("canonical_en") or "").split())[:120]
                for item in returned if isinstance(item, dict)
            }
            expected_ids = {identifier for identifier, _, _ in custom}
            if expected_ids != {
                    key for key, value in canonical_by_id.items() if value}:
                raise ValueError(
                    "The language normalizer missed a custom direction. Try again.")
            normalized = deepcopy(state)
            normalized["creative_brief_en"] = brief_en
            normalized["language_normalization_version"] = (
                LANGUAGE_NORMALIZATION_VERSION)
            normalized["language_source_sha256"] = source_fingerprint
            for identifier, path, _ in custom:
                _replace_at_path(
                    normalized, path, canonical_by_id[identifier])
            compiled = compile_sound_recipe(
                capability, normalized, original_brief)
        except Exception as exc:
            self.operations.repository.finish_attempt(
                attempt_id, "succeeded", cost=cost,
                usage=completion.usage or {},
                request_ids=[completion.request_id]
                if completion.request_id else [], error={}, receipt={
                    "usable_result": False,
                    "validation_error": str(exc)[:600],
                    "provider_region": completion.provider_region,
                    "provider_endpoint": completion.provider_endpoint,
                })
            raise

        self.operations.repository.finish_attempt(
            attempt_id, "succeeded", cost=cost,
            usage=completion.usage or {},
            request_ids=[completion.request_id]
            if completion.request_id else [], error={}, receipt={
                "usable_result": True,
                "compiled_prompt_sha256": hashlib.sha256(
                    compiled.compiled_prompt.encode("utf-8")).hexdigest(),
                "custom_value_count": len(custom),
                "provider_region": completion.provider_region,
                "provider_endpoint": completion.provider_endpoint,
            })
        return {
            **compiled.as_dict(), "normalization_model": MODEL,
            "normalization_cost": cost,
            "normalization_price_version": PRICE_VERSION,
            "usage": completion.usage or {},
        }


class SoundRecipeNormalizationJobHandler:
    def __init__(self, service: SoundRecipeNormalizationService):
        self.service = service

    def __call__(self, job: Job, repository: JobProgressRepository) -> dict[str, Any]:
        repository.progress(job.id, 0, 1, "Understanding the creative brief")
        result = self.service.normalize(
            job_id=job.id,
            capability=str(job.payload.get("capability") or ""),
            semantic_state=job.payload.get("semantic_state") or {},
            source_free_text=str(job.payload.get("source_free_text") or ""),
            confirmed=bool(job.payload.get("confirmed")),
        )
        repository.progress(job.id, 1, 1, "Sound Recipe is ready")
        return {
            **result,
            "cost": float(result.get("normalization_cost") or 0),
        }
