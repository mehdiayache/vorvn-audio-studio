"""Small, non-generative connectivity probe for saved Alibaba settings."""

from __future__ import annotations

from typing import Any

from dashscope import Models

from origins.config import alibaba_environment
from origins.providers.alibaba import sdk_runtime


def test_saved_connection() -> dict[str, Any]:
    """Validate the configured endpoint and API key without running inference."""
    environment = alibaba_environment()
    result: dict[str, Any] = {
        "connected": False,
        "provider": "alibaba",
        "region": environment.region,
        "region_label": environment.region_label,
        "workspace_configured": bool(environment.provider_workspace_id),
    }
    if not environment.api_key_configured:
        return {
            **result,
            "reason": "Save an Alibaba API key before testing the connection.",
        }

    try:
        sdk_runtime.apply_credentials()
        response = Models.list(page_size=1)
    except Exception:
        return {
            **result,
            "reason": (
                "Alibaba could not be reached. Check the network, region and "
                "saved connection settings."
            ),
        }

    status_code = getattr(response, "status_code", None)
    if status_code == 200:
        return {**result, "connected": True}
    if status_code in {401, 403}:
        reason = "Alibaba rejected the saved API key."
    elif status_code == 404 and environment.provider_workspace_id:
        reason = "Alibaba could not find the saved Workspace in this region."
    else:
        reason = "Alibaba rejected the saved connection settings."
    return {**result, "reason": reason}
