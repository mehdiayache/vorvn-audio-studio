"""Shared HTTP contracts for the universal Creator."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CreatorContext(BaseModel):
    """The destination and optional host selection for one Creator session."""

    model_config = ConfigDict(extra="forbid")

    workspace_id: int = Field(gt=0)
    folder_id: int | None = Field(default=None, gt=0)
    project_id: int | None = Field(default=None, gt=0)
    project_type: str | None = Field(default=None, min_length=1, max_length=80)
    object_id: int | None = Field(default=None, gt=0)
    selection: dict[str, Any] = Field(default_factory=dict)
