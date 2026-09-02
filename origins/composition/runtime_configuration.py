"""Composition boundary for the provider environment used by FastAPI."""

from __future__ import annotations

from contextlib import contextmanager
import os
from typing import Iterator

from origins.providers.alibaba.sdk_runtime import apply_credentials
from origins.infrastructure.runtime_environment import (
    OWNED_KEYS,
    reload_owned_environment,
)


@contextmanager
def configured_api_environment() -> Iterator[None]:
    """Load persisted settings and restore the caller's process afterwards.

    The restoration matters for in-process TestClient lifespans. A production
    server exits immediately after this context closes, but a test runner keeps
    importing provider modules and must not inherit the developer's real `.env`.
    """
    previous = {key: os.environ.get(key) for key in OWNED_KEYS}
    reload_owned_environment()
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        apply_credentials()
