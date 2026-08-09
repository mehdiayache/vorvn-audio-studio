"""Alibaba adapter for the text-preparation application service."""

from __future__ import annotations

from audio_studio.application.text_preparation import Completion
from audio_studio.infrastructure.alibaba import config
from services.alibaba import text


class AlibabaTextProvider:
    def complete(self, *, model: str,
                 messages: list[dict[str, str]]) -> Completion:
        result = text.complete_with_metadata(model=model, messages=messages)
        return Completion(
            text=result.text,
            usage=result.usage,
            request_id=result.request_id,
            provider_region=config.region(),
            provider_endpoint=config.workspace_compatible_base_url(),
        )
