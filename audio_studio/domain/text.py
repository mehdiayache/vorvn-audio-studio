"""Provider-neutral result returned by Alibaba text capabilities."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ProviderText:
    text: str
    usage: dict
    request_id: str | None = None
    provider_region: str | None = None
    provider_endpoint: str | None = None
