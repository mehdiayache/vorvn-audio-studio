"""OpenAI-compatible access for Alibaba text models.

The DashScope SDK stores its base URL in a process-wide global.  This server
also uses native HTTP and WebSocket speech APIs, so sharing that global caused
Composer rewrites and translations to inherit the wrong endpoint.  A scoped
client makes the model, key and URL explicit for every text request.
"""

import os
from dataclasses import dataclass

from openai import OpenAI

from audio_studio.infrastructure.alibaba import config


@dataclass(frozen=True, slots=True)
class TextCompletion:
    text: str
    usage: dict
    request_id: str | None = None


def complete_with_metadata(model: str, messages: list[dict],
                           extra_body: dict | None = None) -> TextCompletion:
    """Return text plus the provider facts needed by the durable ledger."""
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set")
    client = OpenAI(
        api_key=key,
        base_url=config.workspace_compatible_base_url(),
        timeout=120.0,
    )
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        **({"extra_body": extra_body} if extra_body else {}),
    )
    content = response.choices[0].message.content
    if not content:
        raise RuntimeError(f"Alibaba {model} returned no text")
    usage = response.usage.model_dump(exclude_none=True) if response.usage else {}
    return TextCompletion(content.strip(), usage, response.id or None)


def complete(model: str, messages: list[dict], extra_body: dict | None = None) -> str:
    """Compatibility result for callers that only need the returned text."""
    return complete_with_metadata(model, messages, extra_body).text
