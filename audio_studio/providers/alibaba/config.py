"""Alibaba endpoint resolution from the current runtime environment."""

from __future__ import annotations

from audio_studio.config import alibaba_environment
from audio_studio.domain.provider_catalog import (
    AUDIO_CLONE_LANGUAGES,
    AUDIO_SYSTEM_VOICES,
    CAPABILITIES,
    QWEN_TTS_CLONE_LANGUAGES,
    model_id,
    normalise_engine,
)


def workspace_id() -> str:
    return alibaba_environment().workspace_id


def region() -> str:
    return alibaba_environment().region


def http_base() -> str:
    return alibaba_environment().native_http_base


def regional_http_base() -> str:
    """Regional DashScope HTTP API used by Qwen-TTS synthesis."""
    host = ("dashscope.aliyuncs.com" if region() == "beijing"
            else "dashscope-intl.aliyuncs.com")
    return f"https://{host}/api/v1"


def websocket_base() -> str:
    environment = alibaba_environment()
    if environment.workspace_id:
        zone = "cn-beijing" if environment.region == "beijing" else "ap-southeast-1"
        return f"wss://{environment.workspace_id}.{zone}.maas.aliyuncs.com/api-ws/v1/inference"
    host = ("dashscope.aliyuncs.com" if environment.region == "beijing"
            else "dashscope-intl.aliyuncs.com")
    return f"wss://{host}/api-ws/v1/inference"


def enrollment_url() -> str:
    return http_base() + "/services/audio/tts/customization"


def compatible_base_url() -> str:
    """Regional OpenAI-compatible endpoint for text-model requests."""
    host = ("dashscope.aliyuncs.com" if region() == "beijing"
            else "dashscope-intl.aliyuncs.com")
    return f"https://{host}/compatible-mode/v1"


def workspace_compatible_base_url() -> str:
    """Workspace-scoped OpenAI-compatible endpoint for text models."""
    environment = alibaba_environment()
    if environment.workspace_id:
        zone = "cn-beijing" if environment.region == "beijing" else "ap-southeast-1"
        return f"https://{environment.workspace_id}.{zone}.maas.aliyuncs.com/compatible-mode/v1"
    return compatible_base_url()
