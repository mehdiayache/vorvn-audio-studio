"""Pydantic request contracts; response contracts evolve from OpenAPI here."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ResourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)


class ResourceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = None
    cover_image: str | None = None
    defaults: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    status: str | None = None
    series_id: int | None = None

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)
