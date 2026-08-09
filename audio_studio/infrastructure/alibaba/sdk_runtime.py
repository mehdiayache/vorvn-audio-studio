"""Mutable DashScope SDK process configuration."""

from __future__ import annotations

import os

import dashscope

from audio_studio.infrastructure.alibaba import config


def apply_credentials() -> None:
    """Refresh credentials and endpoints in the already-imported SDK."""
    dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")
    dashscope.base_http_api_url = config.http_base()
    dashscope.base_websocket_api_url = config.websocket_base()
