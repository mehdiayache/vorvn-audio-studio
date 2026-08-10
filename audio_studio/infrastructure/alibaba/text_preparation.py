"""Alibaba adapter for the text-preparation application service."""

from __future__ import annotations

from audio_studio.domain.text import ProviderText
from audio_studio.infrastructure.alibaba import config, text


class AlibabaTextProvider:
    def complete(self, *, model: str,
                 messages: list[dict[str, str]],
                 reasoning: bool = False) -> ProviderText:
        result = text.complete_with_metadata(
            model=model,
            messages=messages,
            extra_body={"enable_thinking": reasoning},
        )
        return ProviderText(
            text=result.text,
            usage=result.usage,
            request_id=result.request_id,
            provider_region=config.region(),
            provider_endpoint=config.workspace_compatible_base_url(),
        )
