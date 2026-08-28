"""Execute Director jobs through model and provider boundaries."""

from __future__ import annotations

from pathlib import Path
import time
from tempfile import TemporaryDirectory
from typing import Any, Protocol
from urllib.parse import urlparse

from audio_studio.application.jobs import JobProgress
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
        scratch_root: Path, poll_interval: float = 2,
        timeout_seconds: float = 3600, sleeper=time.sleep,
    ):
        self.providers = providers
        self.model_adapters = model_adapters
        self.assets = assets
        self.uploads = uploads
        self.materializer = materializer
        self.scratch_root = scratch_root
        self.poll_interval = poll_interval
        self.timeout_seconds = timeout_seconds
        self.sleeper = sleeper

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
            progress.progress(job.id, 1, 4, "Sending generation request")
            submission = provider.submit(request)
            provider_job_id = submission.provider_job_id
            started = time.monotonic()
            state = None
            while True:
                progress.progress(job.id, 2, 4, "Creating visual")
                state = provider.task(provider_job_id)
                if state.state == "succeeded":
                    break
                if state.state == "failed":
                    raise JobFailed(
                        state.error or "The provider could not create this visual.",
                        result={"provider_job_id": provider_job_id,
                                "provider_state": state.state})
                if state.state not in {"queued", "running"}:
                    raise DirectorProviderError(
                        "The provider returned an unknown generation state.")
                if time.monotonic() - started >= self.timeout_seconds:
                    provider.cancel(provider_job_id)
                    raise DirectorProviderError(
                        "Director generation timed out. Try again.")
                self.sleeper(self.poll_interval)
            if not state.output_urls:
                raise DirectorProviderError(
                    "The provider finished without a downloadable result.")

            collection_id = self.assets.output_collection_for_production(
                production_id)
            if collection_id is None:
                raise JobFailed(
                    "The Production has no Asset library for generated media.")
            output = operation.get("output") or {}
            extension = str(output.get("extension") or "mp4").lstrip(".")
            output_ids: list[int] = []
            self.scratch_root.mkdir(parents=True, exist_ok=True)
            progress.progress(job.id, 3, 4, "Saving generated visual")
            with TemporaryDirectory(
                prefix="director-generation-", dir=self.scratch_root,
            ) as directory:
                for index, url in enumerate(state.output_urls):
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
            progress.progress(job.id, 4, 4, "Generated visual is ready")
            return {
                "output_asset_ids": output_ids,
                "provider_job_id": provider_job_id,
                "provider_state": state.state,
                "estimated_cost": None,
                "usage": (state.raw or {}).get("usage"),
            }
        except JobCancelled:
            if provider_job_id:
                provider.cancel(provider_job_id)
            raise
        except JobFailed:
            raise
        except (DirectorProviderError, RuntimeError, ValueError) as exc:
            raise JobFailed(str(exc), result={
                "provider_job_id": provider_job_id or None,
                "provider_id": provider_id,
            }) from exc
