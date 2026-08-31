"""Provider-neutral facts for external audio discovery."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


CatalogLicense = Literal["cc0", "cc-by", "cc-by-nc"]


@dataclass(frozen=True, slots=True)
class CatalogSound:
    external_id: str
    name: str
    duration_ms: int
    creator: str
    license: CatalogLicense
    license_url: str
    source_url: str
    preview_url: str
    original_format: str
    tags: tuple[str, ...]
    provider_category: str | None = None
    provider_subcategory: str | None = None
    provider_category_is_user_provided: bool | None = None

    @property
    def attribution_required(self) -> bool:
        return self.license != "cc0"

    @property
    def attribution_text(self) -> str:
        if not self.attribution_required:
            return ""
        label = "CC BY-NC" if self.license == "cc-by-nc" else "CC BY"
        return f'"{self.name}" by {self.creator} via Freesound ({label})'


@dataclass(frozen=True, slots=True)
class CatalogDownload:
    path: str
    original_name: str
    size_bytes: int


class AudioCatalogError(RuntimeError):
    """An external catalogue request failed without mutating our Library."""


class AudioCatalogSetupError(AudioCatalogError):
    """A required server-side credential is not configured."""
