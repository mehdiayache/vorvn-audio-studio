"""Provider-neutral planning for installed cloned-voice routes."""

from __future__ import annotations

from dataclasses import dataclass

PACKAGE_LABELS = {
    "complete": (
        "All available capabilities",
        "Every installed recording capability for this identity.",
    ),
    "exact": (
        "Exact narration",
        "Installed exact-reading capabilities for this identity.",
    ),
    "omni": (
        "Natural performance",
        "Installed natural-performance capabilities.",
    ),
}


def language_code(value: str) -> str:
    value = (value or "").strip().lower()
    aliases = {
        "arabic": "ar", "chinese": "zh", "czech": "cs", "danish": "da",
        "dutch": "nl", "english": "en", "farsi": "fa", "persian": "fa",
        "finnish": "fi", "french": "fr", "german": "de", "hebrew": "he",
        "hindi": "hi", "icelandic": "is", "indonesian": "id",
        "italian": "it", "japanese": "ja", "korean": "ko", "malay": "ms",
        "norwegian": "no", "polish": "pl", "portuguese": "pt",
        "russian": "ru", "spanish": "es", "swedish": "sv", "tagalog": "tl",
        "thai": "th", "turkish": "tr", "urdu": "ur", "vietnamese": "vi",
    }
    return aliases.get(value, value)


def plan(language: str, installed_methods: list[dict],
         package: str = "complete") -> dict:
    """Classify persisted installed methods for one explicit reference.

    Provider-specific discovery belongs to infrastructure. This planner only
    classifies the supplied records and never removes an undocumented source
    language from the enrollment plan.
    """
    code = language_code(language)
    available = []
    for method in installed_methods:
        documented = {
            str(item).strip().lower()
            for item in method.get("enrollment_languages") or []
        }
        capability_ids = list(method.get("capability_ids") or [])
        available.append({
            **method,
            "engine": method.get("adapter_key") or method.get("engine") or "",
            "language": code,
            "source_language_documented": bool(code and code in documented),
            "documented_output_languages": list(
                method.get("output_languages") or []),
            "capability_ids": capability_ids,
            "classification": (
                "documented" if code and code in documented else "experimental"),
        })
    creatable = available
    if package == "exact":
        selected = [route for route in creatable
                    if set(route["capability_ids"])
                    & {"expressive_tags", "exact_longform"}]
    elif package == "omni":
        selected = [route for route in creatable
                    if "natural_performance" in route["capability_ids"]]
    else:
        package = "complete"
        selected = creatable
    packages = []
    for key, (name, description) in PACKAGE_LABELS.items():
        routes = (
            [route for route in creatable if set(route["capability_ids"])
             & {"expressive_tags", "exact_longform"}]
            if key == "exact"
            else [route for route in creatable
                  if "natural_performance" in route["capability_ids"]]
            if key == "omni"
            else creatable
        )
        packages.append({
            "id": key, "name": name, "description": description,
            "models": [route["model_id"] for route in routes],
            "available": bool(routes),
        })
    regions = {str(route.get("region") or "") for route in available}
    providers = {str(route.get("provider") or "") for route in available}
    return {
        "region": next(iter(regions)) if len(regions) == 1 else "multiple",
        "region_label": (
            f"{len(providers)} installed provider"
            f"{'s' if len(providers) != 1 else ''} · {len(regions)} region"
            f"{'s' if len(regions) != 1 else ''}"),
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
    provider: str
    region: str
    provider_model_id: str | None
    adapter_key: str
    engine: str
    tier: str
    output_languages: list[str]
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
