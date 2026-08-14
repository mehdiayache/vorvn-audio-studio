"""Alibaba Qwen-MT adapter using the official OpenAI-compatible contract."""

from __future__ import annotations

from audio_studio.domain.text import ProviderText
from audio_studio.providers.alibaba import config, text as alibaba_text


class AlibabaTranslationProvider:
    def translate(self, *, model: str, text: str, source: str | None,
                  target: str) -> ProviderText:
        result = alibaba_text.complete_with_metadata(
            model=model,
            messages=[{"role": "user", "content": text}],
            extra_body={"translation_options": {
                "source_lang": source or "auto",
                "target_lang": target,
            }},
        )
        return ProviderText(
            text=result.text,
            usage=result.usage,
            request_id=result.request_id,
            provider_region=config.region(),
            provider_endpoint=config.workspace_compatible_base_url(),
        )
