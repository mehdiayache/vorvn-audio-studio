"""Pure Alibaba capability, language, model and pricing facts.

This module contains no environment, network, database or HTTP dependencies.
Provider endpoint selection remains an Infrastructure responsibility.
"""

from __future__ import annotations

import json
from pathlib import Path


AUDIO_CLONE_LANGUAGES = {
    "zh": "Chinese", "en": "English", "ja": "Japanese", "ko": "Korean",
    "de": "German", "fr": "French", "it": "Italian", "ru": "Russian",
    "pt": "Portuguese", "th": "Thai", "id": "Indonesian", "ms": "Malay",
    "vi": "Vietnamese",
}

OMNI_CLONE_LANGUAGES = {
    "zh": "Chinese", "en": "English", "de": "German", "it": "Italian",
    "pt": "Portuguese", "es": "Spanish", "ja": "Japanese", "ko": "Korean",
    "fr": "French", "ru": "Russian", "th": "Thai", "id": "Indonesian",
    "ar": "Arabic", "cs": "Czech", "da": "Danish", "nl": "Dutch",
    "fi": "Finnish", "he": "Hebrew", "hi": "Hindi", "is": "Icelandic",
    "ms": "Malay", "no": "Norwegian", "fa": "Persian", "pl": "Polish",
    "sv": "Swedish", "tl": "Tagalog", "tr": "Turkish", "ur": "Urdu",
    "vi": "Vietnamese",
}


def documented_voice_catalog() -> dict:
    path = Path(__file__).with_name("alibaba_voice_catalog.json")
    return json.loads(path.read_text(encoding="utf-8"))


_VOICE_CATALOG = documented_voice_catalog()
AUDIO_SYSTEM_VOICES = {
    tier: {
        item["id"]: item.get("description", "")
        for item in _VOICE_CATALOG["audio"][tier]
    }
    for tier in ("plus", "flash")
}
AUDIO_DEFAULT_VOICES = {"plus": "longanlingxin", "flash": "loongeva_v3.6"}
OMNI_SYSTEM_VOICES = {
    item["id"]: item.get("description", "") for item in _VOICE_CATALOG["omni"]
}

CAPABILITIES = {
    "audio": {
        "label": "Qwen Audio TTS",
        "purpose": "faithful text-to-speech with performance control",
        "models": {
            "plus": "qwen-audio-3.0-tts-plus",
            "flash": "qwen-audio-3.0-tts-flash",
        },
        "clone_tiers": ["flash"],
        "clone_languages": AUDIO_CLONE_LANGUAGES,
        "system_languages": ["Chinese", "English"],
        "rates_per_million_chars": {"plus": 20.0, "flash": 15.0},
        "estimate_rates_per_million_chars": {"plus": 20.0, "flash": 15.0},
        "clone_cost": 0.0,
        "exact_text": True,
        "inline_tags": True,
        "instruction_control": True,
        "fidelity_check": False,
    },
    "omni": {
        "label": "Qwen 3.5 Omni",
        "purpose": "extended multilingual speech and Arabic voice cloning",
        "models": {
            "plus": "qwen3.5-omni-plus",
            "flash": "qwen3.5-omni-flash",
        },
        "clone_tiers": ["plus", "flash"],
        "clone_languages": OMNI_CLONE_LANGUAGES,
        "system_languages": list(dict.fromkeys(OMNI_CLONE_LANGUAGES.values())),
        "system_voices": OMNI_SYSTEM_VOICES,
        "rates_per_million_chars": {},
        # Approximation for spend guards only. Omni bills text/audio tokens;
        # these effective character rates assume normal speech around 12 cps.
        "estimate_rates_per_million_chars": {"plus": 48.0, "flash": 14.0},
        "clone_cost": 0.01,
        "exact_text": False,
        "inline_tags": False,
        "instruction_control": True,
        "fidelity_check": True,
        "token_prices": {
            "plus": {
                "input_text": 1.4, "input_audio": 11.0,
                "output_text": 8.3, "output_audio": 44.0,
            },
            "flash": {
                "input_text": 0.4, "input_audio": 3.0,
                "output_text": 2.2, "output_audio": 11.9,
            },
        },
    },
}


def omni_usage_cost(usage: dict, tier: str) -> float | None:
    """Price a Singapore Omni stream from Alibaba's returned token classes."""
    if not usage:
        return None
    prices = CAPABILITIES["omni"]["token_prices"].get(tier)
    if not prices:
        return None
    return round(sum(
        float(usage.get(kind) or 0) * price for kind, price in prices.items()
    ) / 1_000_000, 6)


def normalise_engine(value: str | None) -> str:
    return value if value in CAPABILITIES else "audio"


def model_id(engine: str, tier: str) -> str:
    engine = normalise_engine(engine)
    tier = tier if tier in CAPABILITIES[engine]["models"] else "plus"
    return CAPABILITIES[engine]["models"][tier]


def recommended_engine(language: str | None) -> str:
    """Pick the narrowest service that officially supports the language."""
    if not language or language == "Auto":
        return "audio"
    if language in CAPABILITIES["audio"]["system_languages"]:
        return "audio"
    return "omni"
