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

QWEN_TTS_CLONE_LANGUAGES = {
    "zh": "Chinese", "en": "English", "de": "German", "it": "Italian",
    "pt": "Portuguese", "es": "Spanish", "ja": "Japanese",
    "ko": "Korean", "fr": "French", "ru": "Russian",
}

COSYVOICE_CLONE_LANGUAGES = {
    "zh": "Chinese", "en": "English", "fr": "French", "de": "German",
    "ja": "Japanese", "ko": "Korean", "ru": "Russian",
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
CAPABILITIES = {
    "audio": {
        "label": "Qwen Audio TTS",
        "operator_title": "Expressive speech + tags",
        "purpose": "Best for emotional stories and character narration.",
        "operator_notes": [
            "Use emotion and vocal-effect tags",
            "Give the recording a natural direction",
            "Adjust speed, pitch and volume",
            "Long text uses continuous recording sessions",
        ],
        "models": {
            "plus": "qwen-audio-3.0-tts-plus",
            "flash": "qwen-audio-3.0-tts-flash",
        },
        "clone_tiers": ["flash"],
        "clone_languages": AUDIO_CLONE_LANGUAGES,
        "output_languages": list(AUDIO_CLONE_LANGUAGES.values()),
        "system_languages": ["Chinese", "English"],
        "rates_per_million_chars": {"plus": 20.0, "flash": 15.0},
        "estimate_rates_per_million_chars": {"plus": 20.0, "flash": 15.0},
        "clone_cost": 0.0,
        "inline_tags": True,
        "instruction_control": True,
    },
    "qwen_tts": {
        "label": "Qwen3 TTS Voice Clone",
        "operator_title": "Exact long reading",
        "purpose": "Best for audiobooks, lessons and straightforward narration.",
        "operator_notes": [
            "Reads your text as written",
            "Long text is joined into one valid recording",
            "No emotion tags or performance directions",
        ],
        "models": {"vc": "qwen3-tts-vc-2026-01-22"},
        "clone_tiers": ["vc"],
        "clone_languages": QWEN_TTS_CLONE_LANGUAGES,
        "output_languages": list(QWEN_TTS_CLONE_LANGUAGES.values()),
        "system_languages": [],
        "rates_per_million_chars": {"vc": 11.5},
        "estimate_rates_per_million_chars": {"vc": 11.5},
        "clone_cost": 0.01,
        "inline_tags": False,
        "instruction_control": False,
    },
    "cosyvoice": {
        "label": "CosyVoice V3 Plus",
        "operator_title": "Controlled exact reading",
        "purpose": "Best for faithful cloned-voice speech with precise delivery controls.",
        "operator_notes": [
            "Reads the prepared script without performance rewriting",
            "Adjust speed, pitch and volume",
            "Use a seed for repeatable generation",
            "Supports SSML and streaming word timestamps",
        ],
        "models": {"plus": "cosyvoice-v3-plus"},
        "clone_tiers": ["plus"],
        "clone_languages": COSYVOICE_CLONE_LANGUAGES,
        "output_languages": list(COSYVOICE_CLONE_LANGUAGES.values()),
        "system_languages": [],
        "rates_per_million_chars": {"plus": 26.0},
        "estimate_rates_per_million_chars": {"plus": 26.0},
        "clone_cost": 0.0,
        "inline_tags": False,
        "instruction_control": False,
    },
}


SEGMENTATION = {
    "audio": {
        "mode": "continuous_session",
        "characters_per_submission": 20_000,
        "characters_per_session": 200_000,
    },
    "qwen_tts": {
        "mode": "token_budget",
        "provider_token_limit": 512,
        "planned_token_budget": 480,
    },
    "cosyvoice": {
        "mode": "continuous_session",
        "characters_per_submission": 20_000,
        "characters_per_session": 200_000,
        "ssml_submissions_per_session": 1,
    },
}


def normalise_engine(value: str | None) -> str:
    if value not in CAPABILITIES:
        raise ValueError(f"Unknown speech engine: {value or 'missing'}")
    return value


def model_id(engine: str, tier: str) -> str:
    engine = normalise_engine(engine)
    models = CAPABILITIES[engine]["models"]
    tier = tier if tier in models else next(iter(models))
    return CAPABILITIES[engine]["models"][tier]
