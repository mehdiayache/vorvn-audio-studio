"""Resolve a human voice identity to one concrete Alibaba binding.

This module owns selection only. It does not call Alibaba, touch files, write
the database, or decide UI policy. Unknown and legacy voices deliberately pass
through so improving the registry never breaks recordings that already work.
"""

from dataclasses import asdict, dataclass
import re

from audio_studio.domain import provider_catalog as config


UNAVAILABLE_STATUSES = {"deleted", "undeployed", "failed", "archived"}


@dataclass(frozen=True)
class VoiceRoute:
    identity_id: str | None
    provider_voice_id: str
    engine: str
    tier: str
    model_id: str
    reason: str
    registry_matched: bool

    def payload(self) -> dict:
        return asdict(self)


def _binding(item: dict) -> dict:
    provider_id = str(item.get("provider_voice_id") or item.get("voice_id") or "")
    model_id = str(item.get("model_id") or item.get("target_model") or "")
    engine = str(item.get("engine") or ("omni" if provider_id.startswith("qwen-omni-vc-") else "audio"))
    tier = str(item.get("tier") or ("flash" if "flash" in model_id else "plus"))
    return {**item, "provider_voice_id": provider_id, "model_id": model_id,
            "identity_id": str(item.get("identity_id") or "") or None,
            "engine": engine, "tier": tier,
            "status": str(item.get("status") or "active").casefold()}


def _legacy_custom(provider_id: str) -> bool:
    return bool(re.search(r"^qwen.*-[0-9a-f]{16,}$", provider_id, re.I))


def _stock_audio(provider_id: str) -> bool:
    return any(provider_id in voices for voices in config.AUDIO_SYSTEM_VOICES.values())


def resolve(payload: dict, bindings: list[dict] | None = None) -> VoiceRoute:
    """Return the concrete provider route for one speech request.

    An exact compatible binding wins. If an existing identity has no such
    variant, its selected ready binding is preserved rather than rejected.
    Unknown legacy clones pass through untouched.
    """
    text = str(payload.get("text") or "")
    language = payload.get("language")
    if language in (None, "", "Auto") and re.search(r"[\u0600-\u06ff]", text):
        language = "Arabic"

    requested_provider = str(payload.get("voice") or "").strip()
    requested_engine = config.normalise_engine(payload.get("engine"))
    requested_tier = payload.get("model") if payload.get("model") in ("plus", "flash") else "plus"
    language_requires_omni = (
        language in config.CAPABILITIES["omni"]["system_languages"]
        and language not in config.CAPABILITIES["audio"]["system_languages"]
    )
    requested_identity = str(payload.get("voice_identity_id") or "").strip() or None
    available = [_binding(item) for item in (bindings or [])]
    available = [item for item in available
                 if item["provider_voice_id"] and item["status"] not in UNAVAILABLE_STATUSES]
    provider_matches = [item for item in available
                        if item["provider_voice_id"] == requested_provider]
    provider_match = next((item for item in provider_matches
                           if item["engine"] == requested_engine
                           and item["tier"] == requested_tier), None)
    provider_match = provider_match or (provider_matches[0] if provider_matches else None)
    inferred_identity = ((provider_match or {}).get("identity_id")
                         if (provider_match or {}).get("source") == "custom" else None)
    identity_id = requested_identity or inferred_identity
    candidates = [item for item in available if identity_id and item["identity_id"] == identity_id]

    if candidates:
        exact = [item for item in candidates
                 if item["engine"] == requested_engine and item["tier"] == requested_tier]
        chosen = next((item for item in exact
                       if item["provider_voice_id"] == requested_provider), None)
        chosen = chosen or (exact[0] if exact else None)
        if chosen:
            reason = "selected_binding" if chosen["provider_voice_id"] == requested_provider else "identity_binding"
        else:
            chosen = next((item for item in candidates
                           if item["provider_voice_id"] == requested_provider), None)
            chosen = chosen or sorted(
                candidates,
                key=lambda item: (item["engine"] == requested_engine,
                                  item["tier"] == requested_tier),
                reverse=True,
            )[0]
            reason = "preserved_available_binding"
        resolved_identity = identity_id if chosen.get("source") == "custom" else None
        return VoiceRoute(resolved_identity, chosen["provider_voice_id"], chosen["engine"],
                          chosen["tier"], chosen["model_id"] or
                          config.model_id(chosen["engine"], chosen["tier"]),
                          reason, True)

    if (provider_match and provider_match.get("source") == "system"
            and not (language_requires_omni and provider_match["engine"] == "audio")):
        return VoiceRoute(None, provider_match["provider_voice_id"],
                          provider_match["engine"], provider_match["tier"],
                          provider_match["model_id"] or config.model_id(
                              provider_match["engine"], provider_match["tier"]),
                          "system_binding", True)

    # System voices and unregistered historic clones remain usable. Arabic only
    # replaces a certainly incompatible stock Audio choice; it never guesses
    # that an unknown custom voice is unusable.
    voice_requires_omni = (requested_provider in config.OMNI_SYSTEM_VOICES
                           or requested_provider.startswith("qwen-omni-vc-"))
    engine = "omni" if voice_requires_omni else requested_engine
    provider_id = requested_provider
    reason = "legacy_passthrough" if _legacy_custom(provider_id) else "provider_passthrough"
    known_audio_system = (_stock_audio(provider_id) or bool(
        provider_match and provider_match.get("source") == "system"
        and provider_match.get("engine") == "audio"))
    if language_requires_omni and (not provider_id or known_audio_system):
        engine, provider_id, reason = "omni", "Tina", "language_safe_fallback"
    if not provider_id:
        provider_id = "Tina" if engine == "omni" else ""
        reason = "default_voice"
    return VoiceRoute(identity_id, provider_id, engine, requested_tier,
                      config.model_id(engine, requested_tier), reason, False)
