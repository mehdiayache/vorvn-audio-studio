"""Reload the small set of provider settings owned by Auvi Studio."""

from __future__ import annotations

import os
from pathlib import Path

from audio_studio.config import settings


ENV_FILE = settings.root / ".env"
REVISION_FILE = settings.root / ".runtime-config-revision"
OWNED_KEYS = {
    "DASHSCOPE_API_KEY", "DASHSCOPE_REGION", "DASHSCOPE_WORKSPACE_ID",
    "FREESOUND_API_TOKEN", "FREESOUND_CLIENT_ID",
    "FREESOUND_OAUTH_ACCESS_TOKEN", "FREESOUND_OAUTH_REFRESH_TOKEN",
    "FREESOUND_OAUTH_EXPIRES_AT",
    "VORVN_AI_API_KEY", "VORVN_AI_BASE_URL",
    "RUSTFS_ENDPOINT", "RUSTFS_ACCESS_KEY", "RUSTFS_SECRET_KEY",
    "RUSTFS_BUCKET", "RUSTFS_PREFIX", "RUSTFS_REGION",
}


def revision() -> int:
    try:
        return REVISION_FILE.stat().st_mtime_ns
    except OSError:
        try:
            return ENV_FILE.stat().st_mtime_ns
        except OSError:
            return 0


def reload_owned_environment() -> None:
    values: dict[str, str] = {}
    if ENV_FILE.is_file():
        for raw in ENV_FILE.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key in OWNED_KEYS:
                values[key] = value.strip().strip("\"'")
    for key, value in values.items():
        os.environ[key] = value
    from audio_studio.providers.alibaba.sdk_runtime import apply_credentials
    apply_credentials()
