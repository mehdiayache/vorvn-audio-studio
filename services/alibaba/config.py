"""One authoritative map of Alibaba speech capabilities and endpoints.

Alibaba exposes several products whose voice IDs and language contracts are not
interchangeable.  Keeping those facts here prevents the UI and the request
handlers from each inventing their own, subtly different, compatibility list.
"""

import os
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

_VOICE_CATALOG = json.loads(
    (Path(__file__).parent / "voice_catalog.json").read_text(encoding="utf-8"))
AUDIO_SYSTEM_VOICES = {
    tier: {item["id"]: item.get("description", "")
           for item in _VOICE_CATALOG["audio"][tier]}
    for tier in ("plus", "flash")
}
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
        # Omni is token-billed. These are deliberately absent: the server
        # estimates from measured audio rather than pretending it is char-billed.
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
            "plus": {"input_text": 1.4, "input_audio": 11.0,
                     "output_text": 8.3, "output_audio": 44.0},
            "flash": {"input_text": 0.4, "input_audio": 3.0,
                      "output_text": 2.2, "output_audio": 11.9},
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
    return round(sum(float(usage.get(kind) or 0) * price
                     for kind, price in prices.items()) / 1_000_000, 6)


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


def workspace_id() -> str:
    return (os.getenv("DASHSCOPE_WORKSPACE_ID") or "").strip()


def region() -> str:
    return "beijing" if os.getenv("DASHSCOPE_REGION", "intl").lower() == "beijing" else "intl"


def http_base() -> str:
    workspace = workspace_id()
    if workspace:
        zone = "cn-beijing" if region() == "beijing" else "ap-southeast-1"
        return f"https://{workspace}.{zone}.maas.aliyuncs.com/api/v1"
    return ("https://dashscope.aliyuncs.com/api/v1" if region() == "beijing"
            else "https://dashscope-intl.aliyuncs.com/api/v1")


def websocket_base() -> str:
    workspace = workspace_id()
    if workspace:
        zone = "cn-beijing" if region() == "beijing" else "ap-southeast-1"
        return f"wss://{workspace}.{zone}.maas.aliyuncs.com/api-ws/v1/inference"
    return ("wss://dashscope.aliyuncs.com/api-ws/v1/inference"
            if region() == "beijing"
            else "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference")


def enrollment_url() -> str:
    return http_base() + "/services/audio/tts/customization"


def compatible_base_url() -> str:
    """OpenAI-compatible base URL used by Qwen 3.5 Omni.

    Enrollment remains on the workspace-native ``/api/v1`` service.  Omni
    inference deliberately uses Alibaba's regional compatible endpoint: the
    Singapore workspace host currently streams transcript-only ``audio``
    objects while reporting audio-token usage, whereas the regional endpoint
    returns the documented ``delta.audio.data`` PCM chunks for the same key and
    payload.  Alibaba documents the regional endpoint as fully functional.
    """
    host = ("https://dashscope.aliyuncs.com" if region() == "beijing"
            else "https://dashscope-intl.aliyuncs.com")
    return host + "/compatible-mode/v1"


def workspace_compatible_base_url() -> str:
    """OpenAI-compatible URL for ordinary text and translation models.

    Unlike the current Omni audio stream anomaly, these models work on the
    workspace-specific endpoint Alibaba recommends.  Keeping this separate
    prevents a process-wide DashScope SDK URL from coupling unrelated APIs.
    """
    workspace = workspace_id()
    if workspace:
        zone = "cn-beijing" if region() == "beijing" else "ap-southeast-1"
        return f"https://{workspace}.{zone}.maas.aliyuncs.com/compatible-mode/v1"
    return compatible_base_url()


def compatible_chat_url() -> str:
    """Full chat URL retained for diagnostics and older callers."""
    return compatible_base_url() + "/chat/completions"
