"""Public contracts for external audio discovery and canonical Keep."""

from pydantic import BaseModel

from origins.domain.audio_catalog import CatalogLicense
from origins.http.upload_contracts import UploadedFileResponse


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
    provider_category: str | None = None
    provider_subcategory: str | None = None
    provider_category_is_user_provided: bool | None = None
    attribution_required: bool
    attribution_text: str


class CatalogSearchEnvelope(BaseModel):
    data: list[CatalogSoundResponse]


class CatalogStatusResponse(BaseModel):
    search_configured: bool
    oauth_client_configured: bool
    keep_configured: bool
    keep_reason: str
    authorization_url: str


class CatalogStatusEnvelope(BaseModel):
    data: CatalogStatusResponse


class CatalogKeepResponse(BaseModel):
    file: UploadedFileResponse
    duplicate: bool


class CatalogKeepEnvelope(BaseModel):
    data: CatalogKeepResponse
