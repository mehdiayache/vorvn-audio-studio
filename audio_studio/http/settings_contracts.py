"""Public response contracts for machine and production Settings."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ProviderSettingsResponse(BaseModel):
    name: str
    configured: bool
    workspace_configured: bool
    workspace_id: str = ""
    region: str
    region_label: str
    http_base: str


class SpendingSettingsResponse(BaseModel):
    warn_above: float
    daily_cap: float
    today: float
    month: float
    all_time: float
    runs: int


class SpeechSettingsResponse(BaseModel):
    fix_dates_phones: bool
    day_first: bool
    synth_flags: dict[str, bool]
    supported_flags: dict[str, str]
    extra_params: str


class DatabaseStatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    connected: bool
    count: int | None = None
    status: str | None = None


class StorageStatusResponse(BaseModel):
    configured: bool
    status: str
    bucket: str | None = None
    endpoint: str | None = None
    reason: str | None = None


class StorageSettingsResponse(BaseModel):
    endpoint: str
    bucket: str
    prefix: str
    region: str
    organization_id: str
    access_key_configured: bool
    secret_key_configured: bool


class SettingsSnapshotResponse(BaseModel):
    provider: ProviderSettingsResponse
    output_directory: str
    spending: SpendingSettingsResponse
    speech: SpeechSettingsResponse
    naming: dict[str, str | int | float | bool]
    naming_tokens: list[str]
    database: DatabaseStatusResponse
    storage: StorageStatusResponse
    storage_settings: StorageSettingsResponse


class SettingsSnapshotEnvelope(BaseModel):
    data: SettingsSnapshotResponse


class StorageTestResponse(BaseModel):
    configured: bool
    bucket: str | None = None
    endpoint: str | None = None
    prefix: str | None = None
    reason: str | None = None


class StorageTestEnvelope(BaseModel):
    data: StorageTestResponse


class DiskLocationResponse(BaseModel):
    bytes: int
    files: int
    where: str | None = None
    what: str | None = None


class DiskSnapshotResponse(BaseModel):
    finished: DiskLocationResponse
    scratch: dict[str, DiskLocationResponse]
    scratch_total: int
    protected: dict[str, DiskLocationResponse]
    protected_total: int
    keep_days: int


class DiskSnapshotEnvelope(BaseModel):
    data: DiskSnapshotResponse


class TidyResultResponse(BaseModel):
    removed: int
    freed: int


class TidyResultEnvelope(BaseModel):
    data: TidyResultResponse


class PronunciationRuleResponse(BaseModel):
    id: int
    pattern: str
    replacement: str
    whole_word: bool
    match_case: bool
    enabled: bool
    phoneme: bool


class PronunciationListEnvelope(BaseModel):
    data: list[PronunciationRuleResponse]


class SavedPronunciationResponse(BaseModel):
    id: int
    rules: list[PronunciationRuleResponse]


class SavedPronunciationEnvelope(BaseModel):
    data: SavedPronunciationResponse


class DeletedPronunciationResponse(BaseModel):
    deleted: bool


class DeletedPronunciationEnvelope(BaseModel):
    data: DeletedPronunciationResponse


class AppliedPronunciationResponse(BaseModel):
    pattern: str
    replacement: str
    count: int


class PronunciationPreviewResponse(BaseModel):
    text: str
    applied: list[AppliedPronunciationResponse]


class PronunciationPreviewEnvelope(BaseModel):
    data: PronunciationPreviewResponse
