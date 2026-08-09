"""Provider-independent planning for one human voice and its model bindings."""

from audio_studio.domain import provider_catalog as catalog
from services.alibaba import config as endpoint_config


PACKAGE_LABELS = {
    "complete": ("Complete production voice",
                 "Exact speech plus best-quality and economical Omni variants."),
    "exact": ("Exact TTS only", "Faithful reading, inline delivery tags and streaming."),
    "omni": ("Omni multilingual", "Best-quality and economical multilingual performance."),
}


def _language_code(value: str) -> str:
    value = (value or "").strip().lower()
    aliases = {name.lower(): code for code, name in {
        **catalog.AUDIO_CLONE_LANGUAGES,
        **catalog.OMNI_CLONE_LANGUAGES,
    }.items()}
    return aliases.get(value, value)


def installed_routes(language: str) -> list[dict]:
    """Every clone binding the installed application can actually consume."""
    code = _language_code(language)
    routes = []
    for engine, capability in catalog.CAPABILITIES.items():
        if code not in capability.get("clone_languages", {}):
            continue
        for tier in capability.get("clone_tiers", []):
            model_id = capability["models"][tier]
            role = ("Exact production" if engine == "audio" else
                    "Best-quality performance" if tier == "plus" else
                    "Economical performance")
            routes.append({
                "provider": "alibaba", "engine": engine, "tier": tier,
                "model_id": model_id, "label": f"{capability['label']} · {tier.title()}",
                "role": role, "language": code,
                "estimated_creation_cost": float(capability.get("clone_cost") or 0),
            })
    return routes


def plan(language: str, package: str = "complete") -> dict:
    code = _language_code(language)
    available = installed_routes(code)
    if package == "exact":
        selected = [route for route in available if route["engine"] == "audio"]
    elif package == "omni":
        selected = [route for route in available if route["engine"] == "omni"]
    else:
        package = "complete"
        selected = available
    packages = []
    for key, (name, description) in PACKAGE_LABELS.items():
        routes = ([route for route in available if route["engine"] == "audio"] if key == "exact"
                  else [route for route in available if route["engine"] == "omni"] if key == "omni"
                  else available)
        packages.append({"id": key, "name": name, "description": description,
                         "models": [route["model_id"] for route in routes],
                         "available": bool(routes)})
    return {
        "region": endpoint_config.region(),
        "region_label": (
            "Beijing" if endpoint_config.region() == "beijing" else "Singapore"
        ),
        "language": code, "package": package,
        "routes": selected, "available_routes": available, "packages": packages,
        "total_estimated_creation_cost": round(sum(
            route["estimated_creation_cost"] for route in selected), 6),
    }
