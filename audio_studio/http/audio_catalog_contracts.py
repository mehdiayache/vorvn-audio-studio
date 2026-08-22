"""Public contracts for external audio discovery and canonical Keep."""

from pydantic import BaseModel

from audio_studio.domain.audio_catalog import CatalogLicense
from audio_studio.http.upload_contracts import UploadedAssetResponse


class CatalogSoundResponse(BaseModel):
    external_id: str
    name: str
    duration_ms: int
    creator: str
    license: CatalogLicense
    license_url: str
    source_url: str
    preview_url: str
    original_format: str
    tags: list[str]
    attribution_required: bool
    attribution_text: str


class CatalogSearchEnvelope(BaseModel):
    data: list[CatalogSoundResponse]


class CatalogStatusResponse(BaseModel):
    search_configured: bool
    keep_configured: bool


class CatalogStatusEnvelope(BaseModel):
    data: CatalogStatusResponse


class CatalogKeepResponse(BaseModel):
    asset: UploadedAssetResponse
    duplicate: bool


class CatalogKeepEnvelope(BaseModel):
    data: CatalogKeepResponse
