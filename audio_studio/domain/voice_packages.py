"""Provider-neutral values for cloned-voice package execution."""

from __future__ import annotations

from dataclasses import dataclass

from audio_studio.domain import provider_catalog as catalog


PACKAGE_LABELS = {
    "complete": (
        "Complete production voice",
        "Every installed exact-reading and performance capability.",
    ),
    "exact": (
        "Exact TTS only",
        "Installed faithful-reading capabilities for this voice.",
    ),
    "omni": (
        "Omni multilingual",
        "Best-quality and economical multilingual performance versions.",
    ),
}


def _language_code(value: str) -> str:
    value = (value or "").strip().lower()
    aliases = {
        name.lower(): code
        for code, name in {
            **catalog.AUDIO_CLONE_LANGUAGES,
            **catalog.OMNI_CLONE_LANGUAGES,
        }.items()
    }
    return aliases.get(value, value)


def installed_routes(language: str) -> list[dict]:
    """Every clone binding the installed application can consume.

    ``language`` describes the uploaded reference recording.  It is useful
    provider provenance, but it is not an output-language policy and must not
    decide which model bindings belong to the human voice identity.
    """
    code = _language_code(language)
    routes = []
    for engine, capability in catalog.CAPABILITIES.items():
        documented_sources = capability.get("clone_languages", {})
        for tier in capability.get("clone_tiers", []):
            model = capability["models"][tier]
            role = (
                "Exact expressive speech" if engine == "audio"
                else "Exact long-form narration" if engine == "qwen_tts"
                else "Best-quality performance" if tier == "plus"
                else "Economical performance"
            )
            routes.append({
                "provider": "alibaba", "engine": engine, "tier": tier,
                "model_id": model,
                "label": (f"{capability['label']} · Voice Clone"
                          if tier == "vc" else
                          f"{capability['label']} · {tier.title()}"),
                "role": role, "language": code,
                "source_language_documented": code in documented_sources,
                "documented_output_languages": list(
                    capability.get("output_languages", [])),
                "estimated_creation_cost": float(
                    capability.get("clone_cost") or 0),
            })
    return routes


def plan(language: str, package: str = "complete", *, region: str) -> dict:
    """Return a deterministic package plan for an explicit deployment."""
    normalized_region = "beijing" if region == "beijing" else "intl"
    code = _language_code(language)
    available = installed_routes(code)
    if package == "exact":
        selected = [route for route in available
                    if route["engine"] != "omni"]
    elif package == "omni":
        selected = [route for route in available if route["engine"] == "omni"]
    else:
        package = "complete"
        selected = available
    packages = []
    for key, (name, description) in PACKAGE_LABELS.items():
        routes = (
            [route for route in available if route["engine"] != "omni"]
            if key == "exact"
            else [route for route in available if route["engine"] == "omni"]
            if key == "omni"
            else available
        )
        packages.append({
            "id": key, "name": name, "description": description,
            "models": [route["model_id"] for route in routes],
            "available": bool(routes),
        })
    return {
        "region": normalized_region,
        "region_label": "Beijing" if normalized_region == "beijing" else "Singapore",
        "language": code, "package": package,
        "routes": selected, "available_routes": available, "packages": packages,
        "total_estimated_creation_cost": round(sum(
            route["estimated_creation_cost"] for route in selected), 6),
    }


@dataclass(frozen=True, slots=True)
class VoicePackageJob:
    id: str
    identity_id: str
    reference_id: str
    model_id: str
    engine: str
    tier: str
    attempts: int
    name: str
    metadata: dict


@dataclass(frozen=True, slots=True)
class CreatedVoiceBinding:
    provider_voice_id: str
    provider_region: str
    provider_endpoint: str
    price_version: str
    estimated_cost: float
    cost: float
    cost_basis: str
