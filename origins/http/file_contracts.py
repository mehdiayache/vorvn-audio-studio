"""Canonical public contracts for Workspace Files and folders."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceFileResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    public_id: str
    workspace_id: int
    name: str
    folder_id: int | None = None
    version_id: int | None = None
    text: str | None = None
    title: str | None = None
    voice: str | None = None
    duration_ms: int | None = None
    filename: str | None = None
    missing: bool | None = None
    source: str
    url: str | None = None
    media_type: Literal[
        "audio", "image", "video", "subtitle", "document", "archive",
        "data", "other",
    ] = "other"
    category: str | None = None
    kind: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    audio_format: str | None = None
    media_format: str | None = None
    sample_rate: int | None = None
    channels: int | None = None
    width: int | None = None
    height: int | None = None
    video_codec: str | None = None
    frame_rate: float | None = None
    size_bytes: int | None = None
    mime_type: str | None = None
    version_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class WorkspaceFolderResponse(BaseModel):
    id: int
    public_id: str
    workspace_id: int
    parent_id: int | None = None
    name: str
    created_at: str
    updated_at: str
