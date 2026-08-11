"""Exact, provider-neutral speech-route validation.

This module never chooses a route.  A caller supplies either one owned
``binding_id`` or one provider ``catalogue_voice_id`` and this module validates
that exact record.  Display language and a reference's recorded language are
deliberately absent from routing decisions.
"""

from dataclasses import asdict, dataclass


READY_STATUSES = {"active", "ready"}


@dataclass(frozen=True, slots=True)
class VoiceRoute:
    binding_id: str | None
    catalogue_voice_id: str | None
    identity_id: str | None
    reference_id: str | None
    provider_voice_id: str
    provider: str
    region: str
    engine: str
    tier: str
    model_id: str
    capability_id: str | None
    capability_name: str | None

    def payload(self) -> dict:
        return asdict(self)


def _normalise(item: dict) -> dict:
    return {
        **item,
        "binding_id": str(item.get("binding_id") or item.get("id") or "") or None,
        "catalogue_voice_id": str(item.get("catalogue_voice_id") or "") or None,
        "identity_id": str(item.get("identity_id") or "") or None,
        "reference_id": str(item.get("reference_id") or "") or None,
        "provider_voice_id": str(item.get("provider_voice_id") or ""),
        "provider": str(item.get("provider") or ""),
        "region": str(item.get("region") or item.get("provider_region") or ""),
        "engine": str(item.get("engine") or ""),
        "tier": str(item.get("tier") or ""),
        "model_id": str(item.get("model_id") or ""),
        "status": str(item.get("status") or "").casefold(),
        "capabilities": list(item.get("capabilities") or []),
    }


def resolve(payload: dict, bindings: list[dict] | None = None,
            catalogue: list[dict] | None = None) -> VoiceRoute:
    """Validate the exact route selected by the operator.

    No matching by provider voice name, model, language, identity, or previous
    preference is permitted.  This is intentionally strict: an unavailable
    route fails instead of silently spending money through another route.
    """
    binding_id = str(payload.get("binding_id") or "").strip() or None
    catalogue_id = str(payload.get("catalogue_voice_id") or "").strip() or None
    if bool(binding_id) == bool(catalogue_id):
        raise ValueError(
            "Choose exactly one ready cloned-voice binding or catalogue voice.")

    records = [_normalise(item) for item in (
        bindings if binding_id else catalogue or [])]
    key = "binding_id" if binding_id else "catalogue_voice_id"
    requested = binding_id or catalogue_id
    chosen = next((item for item in records if item[key] == requested), None)
    if not chosen:
        raise ValueError("That exact voice route no longer exists. Reload Voices.")
    if chosen["status"] not in READY_STATUSES:
        raise ValueError("That exact voice route is not ready.")
    if not all(chosen.get(field) for field in (
            "provider_voice_id", "provider", "region", "model_id", "tier")):
        raise ValueError("That voice route is incomplete and cannot be billed safely.")

    capabilities = chosen["capabilities"]
    requested_capability = str(payload.get("capability_id") or "").strip() or None
    if len(capabilities) > 1 and not requested_capability:
        raise ValueError("Choose a recording mode for this multi-mode route.")
    if requested_capability and requested_capability not in {
            str(item.get("id") or item) for item in capabilities}:
        raise ValueError("That recording mode does not belong to the selected route.")
    capability = next((item for item in capabilities
                       if str(item.get("id") or item) == requested_capability),
                      capabilities[0] if len(capabilities) == 1 else None)
    capability_id = (str(capability.get("id") or "") if isinstance(capability, dict)
                     else str(capability or "")) or None
    capability_name = (str(capability.get("name") or "")
                       if isinstance(capability, dict) else "") or None

    return VoiceRoute(
        binding_id=binding_id, catalogue_voice_id=catalogue_id,
        identity_id=chosen["identity_id"] if binding_id else None,
        reference_id=chosen["reference_id"] if binding_id else None,
        provider_voice_id=chosen["provider_voice_id"],
        provider=chosen["provider"], region=chosen["region"],
        engine=chosen["engine"], tier=chosen["tier"],
        model_id=chosen["model_id"], capability_id=capability_id,
        capability_name=capability_name,
    )
