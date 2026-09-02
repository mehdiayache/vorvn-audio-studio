"""Voice registry assembled from documented and enrolled provider voices.

UI clients consume this contract instead of reproducing model/voice compatibility
rules. System voices come from the versioned Alibaba documentation snapshot;
custom voices come from the account's live enrollment APIs.
"""

import json
from pathlib import Path

from origins.domain import provider_catalog as config


ROOT = Path(__file__).parent

CAPABILITY_IDS = {
    "audio": "expressive_tags",
    "qwen_tts": "exact_longform",
    "cosyvoice": "controlled_exact",
}


def _read(name: str):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def catalog() -> dict:
    return config.documented_voice_catalog()


def presets() -> list[dict]:
    return _read("performance_presets.json")


def system_bindings() -> list[dict]:
    data = catalog()
    bindings = []
    for tier, voices in data["audio"].items():
        model_id = config.CAPABILITIES["audio"]["models"][tier]
        for voice in voices:
            bindings.append({
                "catalogue_voice_id": f"alibaba:intl:{model_id}:{voice['id']}",
                "identity_id": f"alibaba:audio:{voice['id']}",
                "provider_voice_id": voice["id"],
                "name": voice.get("name") or voice["id"],
                "description": voice.get("description") or "",
                "gender": voice.get("gender") or "",
                "languages": voice.get("languages") or [],
                "source": "system", "provider": "alibaba",
                "region": "intl",
                "engine": "audio", "adapter_key": "audio",
                "tier": tier, "model_id": model_id,
                "capabilities": [{
                    "id": CAPABILITY_IDS["audio"],
                    "name": config.CAPABILITIES["audio"]["operator_title"],
                }],
                "status": "active",
            })
    return bindings


def assemble(custom_voices: list[dict], metadata: dict, references: dict,
             catalogue_voices: list[dict] | None = None) -> dict:
    bindings = list(catalogue_voices) if catalogue_voices is not None else system_bindings()
    for item in custom_voices:
        provider_voice_id = str(
            item.get("provider_voice_id") or item.get("voice_id")
            or item.get("voice") or "")
        if not provider_voice_id:
            continue
        saved = metadata.get(provider_voice_id.casefold(), {})
        engine = item.get("engine") or saved.get("engine") or "audio"
        if engine not in config.CAPABILITIES:
            continue
        model_id = item.get("target_model") or item.get("targetModel") or saved.get("target_model") or ""
        capability = config.CAPABILITIES.get(str(engine), {})
        tier = item.get("tier") or next((
            name for name, model in capability.get("models", {}).items()
            if model == model_id
        ), "flash" if "flash" in model_id else "plus")
        language = item.get("language") or item.get("languages") or saved.get("languages") or ""
        if isinstance(language, (list, tuple, set)):
            languages = [str(part).strip() for part in language if str(part).strip()]
        else:
            languages = [part.strip() for part in str(language).replace(",", " ").split()
                         if part.strip()]
        identity_id = item.get("identity_id") or references.get(provider_voice_id, {}).get("identity_id") or f"custom:{provider_voice_id}"
        bindings.append({
            "binding_id": item.get("binding_id"),
            "identity_id": identity_id,
            "provider_voice_id": provider_voice_id,
            "name": item.get("name") or saved.get("name") or provider_voice_id,
            "description": item.get("trait") or item.get("notes") or saved.get("trait") or saved.get("note") or "Your cloned voice",
            "image": item.get("image") or saved.get("image") or "",
            "gender": item.get("gender") or saved.get("gender") or "",
            "age": item.get("age") or saved.get("age"),
            "accent": item.get("accent") or "",
            "scene": item.get("scene") or saved.get("scene") or "",
            "languages": languages,
            "source": "custom", "provider": item.get("provider") or "alibaba",
            "region": item.get("region") or item.get("provider_region") or "intl",
            "engine": engine, "adapter_key": item.get("adapter_key") or engine,
            "tier": tier, "model_id": model_id,
            "estimate_rate_per_million_chars": float(
                item.get("estimate_rate_per_million_chars") or 0),
            "capabilities": item.get("capabilities") or [{
                "id": CAPABILITY_IDS.get(engine, engine),
                "name": capability.get("operator_title") or engine,
            }],
            "status": item.get("status") or saved.get("provider_status") or "active",
            "reference_id": item.get("reference_id"),
            "reference": references.get(provider_voice_id),
        })
    models = []
    for engine, capability in config.CAPABILITIES.items():
        for tier, model_id in capability["models"].items():
            compatible = [item for item in bindings
                          if item["engine"] == engine and item["tier"] == tier
                          and str(item.get("status", "")).lower() not in ("undeployed", "deleted")]
            models.append({
                "engine": engine, "tier": tier, "model_id": model_id,
                "label": capability["label"],
                "system_count": sum(item["source"] == "system" for item in compatible),
                "custom_count": sum(item["source"] == "custom" for item in compatible),
                "total_count": len(compatible),
                "clone_supported": tier in capability.get("clone_tiers", []),
            })
    return {
        "models": models,
        "bindings": bindings,
        "presets": presets(),
        "source": catalog()["source"],
    }
