"""Alibaba adapter for creating one exact provider voice binding."""

from __future__ import annotations

import os
from pathlib import Path
import re
import threading
import time
from typing import Callable

from origins.infrastructure import object_storage as storage
from origins.providers.alibaba import config, qwen_tts, sdk_runtime
from origins.domain.provider_pricing import PRICE_VERSION

from origins.domain.voice_packages import (
    CreatedVoiceBinding,
    VoicePackageJob,
)


_REFERENCE_URLS: dict[str, tuple[float, str]] = {}
_REFERENCE_URL_LOCK = threading.Lock()


def _prefix(name: str, engine: str) -> str:
    qwen_enrollment = engine == "qwen_tts"
    limit = 16 if qwen_enrollment else 10
    pattern = r"[^a-z0-9_]" if qwen_enrollment else r"[^a-z0-9]"
    clean = re.sub(pattern, "", name.casefold())
    return (clean or "voice")[:limit]


class AlibabaVoiceCloningProvider:
    @staticmethod
    def is_configured() -> bool:
        return bool(os.getenv("DASHSCOPE_API_KEY", "").strip()) \
            and storage.configured()

    @staticmethod
    def _validate(job: VoicePackageJob) -> dict:
        capability = config.CAPABILITIES.get(job.engine) or {}
        expected_model = (capability.get("models") or {}).get(job.tier)
        if job.provider != "alibaba" or job.region != config.region():
            raise ValueError(
                "That exact Alibaba enrollment region is not active in this "
                "Origins deployment.")
        if not expected_model or expected_model != job.model_id:
            raise ValueError(
                "That exact Alibaba model and tier are not installed for "
                "voice enrollment.")
        if not AlibabaVoiceCloningProvider.is_configured():
            raise RuntimeError(
                "Alibaba and Reference audio storage must be configured before cloning.")
        return capability

    @staticmethod
    def estimated_cost(job: VoicePackageJob) -> float:
        capability = AlibabaVoiceCloningProvider._validate(job)
        return float(capability.get("clone_cost") or 0)

    @staticmethod
    def _reference_url(job: VoicePackageJob, local: Path) -> str:
        cache_key = job.reference_window_id or job.reference_id
        with _REFERENCE_URL_LOCK:
            cached = _REFERENCE_URLS.get(cache_key)
            if cached and time.monotonic() - cached[0] < 600:
                return cached[1]
            url = storage.upload(
                local, kind="voice-references",
                object_id=f"{job.reference_id}-{cache_key}",
                retention="durable")
            _REFERENCE_URLS[cache_key] = (time.monotonic(), url)
            return url

    def create(self, job: VoicePackageJob, local: Path,
               on_sent: Callable[[], None] = lambda: None
               ) -> CreatedVoiceBinding:
        capability = self._validate(job)
        url = self._reference_url(job, local)
        language = str(job.metadata.get("language") or "").strip() or None
        prefix = _prefix(job.name, job.engine)
        if job.engine == "qwen_tts":
            on_sent()
            provider_voice_id = qwen_tts.create_voice(
                job.model_id, prefix, url,
                language=language,
                transcript=str(job.metadata.get("transcript") or "").strip()
                or None)
            endpoint = config.http_base()
        elif job.engine in {"audio", "cosyvoice"}:
            from dashscope.audio.tts_v2 import VoiceEnrollmentService
            sdk_runtime.apply_credentials()
            documented_sources = capability.get(
                "clone_languages", {})
            language_hint = language if language in documented_sources else None
            on_sent()
            enrollment_options = {
                "target_model": job.model_id,
                "prefix": prefix,
                "url": url,
                "language_hints": [language_hint] if language_hint else None,
            }
            # Alibaba documents source-window control for Qwen Audio, but not
            # for cosyvoice-v3-plus. Never send an undocumented option merely
            # because both models share the SDK transport.
            if job.engine == "audio":
                source_seconds = float(
                    job.metadata.get("window_duration_ms") or 20_000) / 1000
                enrollment_options["max_prompt_audio_length"] = min(
                    30.0, max(3.0, source_seconds),
                )
                enrollment_options["enable_preprocess"] = bool(
                    job.metadata.get("enable_preprocess"))
            provider_voice_id = VoiceEnrollmentService().create_voice(
                **enrollment_options,
            )
            endpoint = config.http_base()
        else:
            raise ValueError(f"Unsupported Alibaba enrollment engine: {job.engine}")
        estimate = self.estimated_cost(job)
        return CreatedVoiceBinding(
            provider_voice_id=str(provider_voice_id),
            provider_region=config.region(), provider_endpoint=endpoint,
            price_version=PRICE_VERSION, estimated_cost=estimate, cost=estimate,
            cost_basis="catalog_creation" if estimate else "not_billed",
        )
