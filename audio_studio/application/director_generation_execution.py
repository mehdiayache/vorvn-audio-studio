"""Execute Director jobs through model and provider boundaries."""

from __future__ import annotations

from pathlib import Path
import time
from tempfile import TemporaryDirectory
from typing import Any, Protocol
from urllib.parse import urlparse

from audio_studio.application.jobs import JobProgress
from audio_studio.application.preferences import load_preferences
from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.application.uploads import UploadService
from audio_studio.domain.jobs import Job, JobCancelled, JobFailed
from audio_studio.providers.director import (
    DirectorModelAdapter, DirectorProvider, DirectorProviderError,
)


class DirectorExecutionAssets(Protocol):
    def list_for_production(self, production_id: int) -> list[dict]: ...
    def output_collection_for_production(
        self, production_id: int,
    ) -> int | None: ...
    def attach_to_director(
        self, production_id: int, asset_id: int,
    ) -> bool | None: ...


class DirectorInputMaterializer(Protocol):
    def materialize(
        self, asset: dict[str, Any], *, job_id: str, role: str,
    ) -> dict[str, Any]: ...


class DirectorGenerationHandler:
    def __init__(
        self, *, providers: dict[str, DirectorProvider],
        model_adapters: dict[str, DirectorModelAdapter],
        assets: DirectorExecutionAssets, uploads: UploadService,
        materializer: DirectorInputMaterializer,
        operations: ProviderOperationService,
        scratch_root: Path, poll_interval: float = 2,
        timeout_seconds: float = 3600, sleeper=time.sleep,
        clock=time.monotonic, preferences=load_preferences,
    ):
        self.providers = providers
        self.model_adapters = model_adapters
        self.assets = assets
        self.uploads = uploads
        self.materializer = materializer
        self.operations = operations
        self.scratch_root = scratch_root
        self.poll_interval = poll_interval
        self.timeout_seconds = timeout_seconds
        self.sleeper = sleeper
        self.clock = clock
        self.preferences = preferences

    def __call__(self, job: Job, progress: JobProgress) -> dict[str, Any]:
        payload = job.payload
        provider_id = str(payload.get("provider_id") or "")
        model_id = str(payload.get("model") or "")
        provider = self.providers.get(provider_id)
        adapter = self.model_adapters.get(model_id)
        if not provider or not adapter:
            raise JobFailed("That Director model is not available.")
        snapshot = payload.get("capability_snapshot") or {}
        operation = next(iter(snapshot.get("operations") or []), None)
        if not operation:
            raise JobFailed("This generation has no capability snapshot.")
        production_id = int(payload.get("production_id") or 0)
        available = {
            int(asset["id"]): asset
            for asset in self.assets.list_for_production(production_id)
        }
        recipe = payload.get("recipe") or {}
        provider_job_id = ""
        attempt_id = ""
        attempt_finished = False
        provider_succeeded = False
        actual_cost = 0.0
        usage: dict[str, Any] = {}
        try:
            progress.progress(job.id, 0, 4, "Preparing Director references")
            materialized = []
            for item in recipe.get("inputs") or []:
                asset = available.get(int(item.get("asset_id") or 0))
                if not asset:
                    raise JobFailed(
                        "A Director reference is no longer available.")
                materialized.append(self.materializer.materialize(
                    asset, job_id=str(job.public_id), role=str(item["role"])))
            provider_parameters = (
                (recipe.get("controls") or {}).get("provider_parameters") or {})
            materialized_parameters: dict[str, Any] = {}
            for field in operation.get("parameters") or []:
                if field.get("type") != "asset_list":
                    continue
                key = str(field["key"])
                groups = []
                for group_index, group in enumerate(
                        provider_parameters.get(key) or []):
                    next_group = {
                        item_key: item_value for item_key, item_value in group.items()
                        if item_key not in {"asset_ids", "audio_asset_ids"}
                    }
                    next_group["assets"] = []
                    next_group["audio_assets"] = []
                    for list_key, output_key in (
                        ("asset_ids", "assets"),
                        ("audio_asset_ids", "audio_assets"),
                    ):
                        for asset_id_value in group.get(list_key) or []:
                            asset = available.get(int(asset_id_value))
                            if not asset:
                                raise JobFailed(
                                    "A Director subject reference is no longer available.")
                            next_group[output_key].append(
                                self.materializer.materialize(
                                    asset, job_id=str(job.public_id),
                                    role=f"{key}:{group_index}"))
                    groups.append(next_group)
                materialized_parameters[key] = groups
            request = adapter.request(
                model=snapshot, operation=operation, recipe=recipe,
                materialized_inputs=materialized,
                materialized_parameters=materialized_parameters)
            attempt_operation = "director_generate"
            attempt = self.operations.repository.attempt_for_job(
                job.id, attempt_operation)
            if attempt:
                attempt_id = str(attempt["id"])
                actual_cost = float(attempt.get("cost") or 0)
                usage = attempt.get("usage") or {}
                provider_job_id = str(
                    attempt.get("provider_request_id") or "")
                artifact = (attempt.get("diagnostics") or {}).get(
                    "local_artifact") or {}
                output_ids = artifact.get("output_asset_ids") or []
                if attempt.get("status") == "succeeded" and output_ids:
                    progress.progress(job.id, 4, 4, "Generated visual is ready")
                    return {
                        "output_asset_ids": [int(value) for value in output_ids],
                        "provider_job_id": provider_job_id,
                        "provider_state": "succeeded",
                        "provider_attempt_id": attempt_id,
                        "estimated_cost": attempt.get("estimated_cost"),
                        "cost": attempt.get("cost") or 0,
                        "usage": attempt.get("usage") or {},
                    }
                if attempt.get("status") in {
                    "ambiguous", "definitive_failed",
                }:
                    raise JobFailed(
                        "This provider attempt cannot be resumed safely.",
                        result={"provider_attempt_id": attempt_id,
                                "requires_review": True})
            else:
                estimate = provider.estimate_cost(request)
                preferences = self.preferences()
                warning = float(preferences.get("warn_above") or 0)
                if (warning > 0 and estimate > warning
                        and not bool(payload.get("confirmed"))):
                    return {
                        "needs_confirmation": True,
                        "estimated_cost": estimate,
                        "cost": 0,
                        "usage": {},
                        "confirmation_message": (
                            f"Generate this result for about ${estimate:.4f}?"),
                    }
                try:
                    reservation_id = self.operations.authorize(
                        job.id, attempt_operation, estimate, preferences,
                        bool(payload.get("confirmed")))
                except PermissionError as exc:
                    raise JobFailed(str(exc)) from exc
                attempt_id = self.operations.repository.begin_attempt(
                    job.id, attempt_operation,
                    {
                        "provider": provider_id,
                        "model": payload.get("provider_model_id"),
                        "adapter": payload.get("adapter_version"),
                    },
                    {
                        "recipe": recipe,
                        "capability_manifest_version": payload.get(
                            "capability_manifest_version"),
                    },
                    reservation_id,
                    estimated_cost=estimate,
                )
                progress.progress(job.id, 1, 4, "Sending generation request")
                submission = provider.submit(
                    request, callback_reference=attempt_id)
                provider_job_id = submission.provider_job_id
                self.operations.repository.mark_sent(
                    attempt_id, provider_job_id)
                attempt = self.operations.repository.attempt_for_job(
                    job.id, attempt_operation)
            started = self.clock()
            next_reconcile_at = (
                started + 20 if provider.callback_configured() else started)
            reconcile_delay = self.poll_interval
            state = None
            while True:
                attempt = self.operations.repository.attempt_for_job(
                    job.id, attempt_operation)
                diagnostics = (attempt or {}).get("diagnostics") or {}
                callback_payload = diagnostics.get("provider_callback")
                stored_result = diagnostics.get("provider_result")
                provider_job_id = str(
                    (attempt or {}).get("provider_request_id")
                    or provider_job_id or "")
                if stored_result:
                    state = provider.state_from_callback(stored_result)
                    provider_succeeded = True
                elif callback_payload:
                    state = provider.state_from_callback(callback_payload)
                elif not provider_job_id:
                    if not provider.callback_configured():
                        raise JobFailed(
                            "KIE may have accepted this request, but no task ID "
                            "was persisted. Review it before generating again.",
                            result={"provider_attempt_id": attempt_id,
                                    "requires_review": True})
                    state = None
                elif self.clock() >= next_reconcile_at:
                    state = provider.task(provider_job_id)
                    if provider.callback_configured():
                        reconcile_delay = 30
                    else:
                        reconcile_delay = min(max(reconcile_delay * 2, 2), 30)
                    next_reconcile_at = self.clock() + reconcile_delay
                if state is not None and state.state == "succeeded":
                    break
                if state is not None and state.state == "failed":
                    actual_cost, usage = provider.accounting(state)
                    if not usage:
                        actual_cost = float((attempt or {}).get(
                            "estimated_cost") or 0)
                        usage = {"basis": "reserved_estimate"}
                    self.operations.repository.finish_attempt(
                        attempt_id, "definitive_failed", cost=actual_cost,
                        usage=usage,
                        request_ids=[provider_job_id],
                        error={"message": state.error}, receipt=state.raw)
                    attempt_finished = True
                    raise JobFailed(
                        state.error or "The provider could not create this visual.",
                        result={"provider_job_id": provider_job_id,
                                "provider_state": state.state})
                if state is not None and state.state not in {"queued", "running"}:
                    raise DirectorProviderError(
                        "The provider returned an unknown generation state.")
                if state is None or state.progress is None:
                    # Unknown provider progress is deliberately indeterminate.
                    # A fake percentage is worse than an honest running state.
                    progress.progress(job.id, 0, 1, "Creating visual")
                else:
                    progress.progress(
                        job.id, state.progress, 100, "Creating visual")
                if self.clock() - started >= self.timeout_seconds:
                    if provider_job_id:
                        provider.cancel(provider_job_id)
                    raise DirectorProviderError(
                        "Director generation timed out. Try again.")
                self.sleeper(min(self.poll_interval, 1)
                             if provider.callback_configured()
                             else min(reconcile_delay, 30))
            if not state.output_urls:
                raise DirectorProviderError(
                    "The provider finished without a downloadable result.")
            if not provider_succeeded:
                actual_cost, usage = provider.accounting(state)
                if not usage:
                    actual_cost = float((attempt or {}).get(
                        "estimated_cost") or 0)
                    usage = {"basis": "reserved_estimate"}
                self.operations.repository.record_provider_result(
                    attempt_id, cost=actual_cost, usage=usage,
                    receipt=state.raw or {})
                provider_succeeded = True

            collection_id = self.assets.output_collection_for_production(
                production_id)
            if collection_id is None:
                raise JobFailed(
                    "The Production has no Asset library for generated media.")
            output = operation.get("output") or {}
            extension = str(output.get("extension") or "mp4").lstrip(".")
            artifact = ((attempt or {}).get("diagnostics") or {}).get(
                "local_artifact") or {}
            output_ids: list[int] = [
                int(value) for value in artifact.get("output_asset_ids") or []]
            self.scratch_root.mkdir(parents=True, exist_ok=True)
            progress.progress(job.id, 3, 4, "Saving generated visual")
            with TemporaryDirectory(
                prefix="director-generation-", dir=self.scratch_root,
            ) as directory:
                for index, url in enumerate(state.output_urls):
                    if index < len(output_ids):
                        continue
                    url_suffix = Path(urlparse(url).path).suffix.casefold()
                    suffix = (url_suffix if url_suffix in {
                        ".mp4", ".mov", ".webm", ".png", ".jpg",
                        ".jpeg", ".webp",
                    } else f".{extension}")
                    target = Path(directory) / f"result-{index}{suffix}"
                    size = provider.download(url, target)
                    candidate_id = f"director:{job.public_id}:{index}"
                    name = str(recipe.get("prompt") or snapshot.get("label")
                               or "Director result").strip()[:120]
                    details = self.uploads.prepare_asset_upload(
                        target.name, name=name, category=None,
                        scope="venture", supplied_tags=("director",),
                        metadata={
                            "origin": "director-generation",
                            "external_id": candidate_id,
                            "provider_id": provider_id,
                            "provider_model_id": payload.get(
                                "provider_model_id"),
                            "provider_job_id": provider_job_id,
                            "adapter_version": payload.get(
                                "adapter_version"),
                            "capability_manifest_version": payload.get(
                                "capability_manifest_version"),
                            "recipe": recipe,
                        },
                    )
                    kept = self.uploads.save_generated_asset_file(
                        collection_id, target, size,
                        candidate_id=candidate_id, details=details)
                    asset_id = int(kept["asset"]["id"])
                    self.assets.attach_to_director(production_id, asset_id)
                    output_ids.append(asset_id)
                    self.operations.repository.record_artifact(
                        attempt_id, {"output_asset_ids": output_ids})
            self.operations.repository.finish_attempt(
                attempt_id, "succeeded", cost=actual_cost,
                usage=usage, request_ids=[provider_job_id], error={},
                receipt=state.raw)
            attempt_finished = True
            progress.progress(job.id, 4, 4, "Generated visual is ready")
            return {
                "output_asset_ids": output_ids,
                "provider_job_id": provider_job_id,
                "provider_state": state.state,
                "provider_attempt_id": attempt_id,
                "estimated_cost": (attempt or {}).get("estimated_cost"),
                "cost": actual_cost,
                "cost_basis": usage.get("basis") or "provider_reported",
                "usage": usage,
            }
        except JobCancelled:
            if provider_job_id:
                provider.cancel(provider_job_id)
            raise
        except JobFailed as exc:
            if provider_succeeded and attempt_id and not exc.result.get(
                    "can_retry_ingestion"):
                self.operations.repository.record_artifact(attempt_id, {
                    "output_asset_ids": output_ids if 'output_ids' in locals() else [],
                    "ingestion_error": str(exc),
                })
                raise JobFailed(str(exc), result={
                    "provider_job_id": provider_job_id or None,
                    "provider_id": provider_id,
                    "provider_attempt_id": attempt_id,
                    "provider_succeeded": True,
                    "local_ingestion_pending": True,
                    "can_retry_ingestion": True,
                    "estimated_cost": (attempt or {}).get("estimated_cost"),
                    "cost": actual_cost,
                    "usage": usage,
                }) from exc
            raise
        except (DirectorProviderError, RuntimeError, ValueError) as exc:
            if provider_succeeded and attempt_id:
                self.operations.repository.record_artifact(attempt_id, {
                    "output_asset_ids": output_ids if 'output_ids' in locals() else [],
                    "ingestion_error": str(exc),
                })
                raise JobFailed(str(exc), result={
                    "provider_job_id": provider_job_id or None,
                    "provider_id": provider_id,
                    "provider_attempt_id": attempt_id,
                    "provider_succeeded": True,
                    "local_ingestion_pending": True,
                    "can_retry_ingestion": True,
                    "estimated_cost": (attempt or {}).get("estimated_cost"),
                    "cost": actual_cost,
                    "usage": usage,
                }) from exc
            if attempt_id and provider_job_id and not attempt_finished:
                self.operations.repository.finish_attempt(
                    attempt_id,
                    self.operations.failure_status(exc),
                    cost=0, usage={}, request_ids=[provider_job_id],
                    error={"message": str(exc)})
            raise JobFailed(str(exc), result={
                "provider_job_id": provider_job_id or None,
                "provider_id": provider_id,
                "provider_attempt_id": attempt_id or None,
                "requires_review": bool(attempt_id and not provider_job_id),
            }) from exc
