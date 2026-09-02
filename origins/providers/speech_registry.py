"""Exact speech-adapter dispatch with no provider or model fallback."""

from __future__ import annotations

from origins.domain import voice_routing
from origins.domain.speech import PreparedSpeech, SynthesizedSpeech
from origins.providers.base import BaseTTSProvider


class ExactSpeechProviderRegistry:
    """Dispatch the operator's exact route to one registered adapter.

    Keys come from provider-model records.  Missing keys fail immediately;
    the registry never substitutes another provider, model, tier or engine.
    """

    def __init__(self, adapters: dict[tuple[str, str], BaseTTSProvider]):
        self._adapters = dict(adapters)

    def is_configured(self) -> bool:
        return any(adapter.is_configured() for adapter in self._adapters.values())

    def prepare(self, *, text: str, values: dict, bindings: list[dict],
                catalogue: list[dict], pronunciations: list[dict],
                preferences: dict) -> PreparedSpeech:
        route = voice_routing.resolve(values, bindings, catalogue)
        adapter = self._adapter(route.provider, route.adapter_key)
        if not adapter.is_configured():
            raise RuntimeError(
                f"The {route.provider} speech adapter is not configured.")
        prepared = adapter.prepare(
            text=text, values=values, bindings=bindings, catalogue=catalogue,
            pronunciations=pronunciations, preferences=preferences)
        exact = prepared.voice_route or {}
        expected = route.payload()
        route_fields = (
            "binding_id", "catalogue_voice_id", "identity_id", "reference_id",
            "provider_voice_id", "provider", "region", "adapter_key", "engine",
            "tier", "model_id", "capability_id")
        if any(exact.get(field) != expected.get(field)
               for field in route_fields):
            raise RuntimeError("The speech adapter changed the exact requested route.")
        return prepared

    def synthesize(self, prepared: PreparedSpeech,
                   on_progress=None) -> SynthesizedSpeech:
        route = prepared.voice_route or {}
        adapter = self._adapter(
            str(route.get("provider") or ""),
            str(route.get("adapter_key") or ""))
        return adapter.synthesize(prepared, on_progress=on_progress)

    def _adapter(self, provider: str, adapter_key: str) -> BaseTTSProvider:
        adapter = self._adapters.get((provider, adapter_key))
        if not adapter:
            raise ValueError(
                f"No speech adapter is installed for {provider}:{adapter_key}.")
        return adapter
