"""One authoritative map of Alibaba speech capabilities and endpoints.

Alibaba exposes several products whose voice IDs and language contracts are not
interchangeable.  Keeping those facts here prevents the UI and the request
handlers from each inventing their own, subtly different, compatibility list.
"""

import os

from audio_studio.domain.provider_catalog import (
    AUDIO_CLONE_LANGUAGES,
    AUDIO_SYSTEM_VOICES,
    CAPABILITIES,
    OMNI_CLONE_LANGUAGES,
    OMNI_SYSTEM_VOICES,
    model_id,
    normalise_engine,
    omni_usage_cost,
    recommended_engine,
)


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
