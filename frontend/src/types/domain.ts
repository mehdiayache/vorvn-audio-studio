import type { components } from "./api.generated"

export type ResourceType = "venture" | "project" | "series" | "production"

export type HierarchyNode = {
  key: string
  id: number
  public_id: string
  type: ResourceType
  parent_key: string | null
  name: string
  description: string
  icon: string
  system_role?: string | null
  locked: boolean
  metrics: { parts: number; cost: number }
  updated_at?: string
}

export type TrailItem = { id: number; public_id: string; type: Exclude<ResourceType, "production">; name: string; icon?: string }

export type ProductionSummary = {
  id: number
  public_id: string
  name: string
  description: string
  status: string
  series_id: number | null
  part_count: number
  duration_ms: number
  total_cost: number
  current_sequence_cost?: number
  updated_at?: string | null
}

export type WorkResource = {
  id: number
  public_id: string
  key: string
  type: "venture" | "project" | "series"
  name: string
  description: string
  icon: string
  cover_image?: string
  updated_at?: string | null
  locked?: boolean
  project_id?: number
}

export type SeriesSummary = {
  id: number
  public_id: string
  name: string
  description: string
  defaults: Record<string, unknown>
  metrics: { production_count: number; part_count: number; duration_ms: number; total_cost: number; current_sequence_cost?: number }
  updated_at?: string | null
}

export type ProjectSummary = {
  id: number
  public_id: string
  name: string
  description: string
  cover_image: string
  metrics: { production_count: number; part_count: number; duration_ms: number; total_cost: number; current_sequence_cost?: number }
  updated_at?: string | null
}

export type WorkMetrics = {
  project_count?: number
  series_count?: number
  standalone_count?: number
  production_count: number
  part_count: number
  duration_ms: number
  total_cost: number
  current_sequence_cost?: number
}

export type ActivityRun = components["schemas"]["ActivityRunResponse"]

export type ActivitySnapshot = components["schemas"]["ActivitySnapshotResponse"]

export type SettingsSnapshot = {
  provider: {
    name: string
    configured: boolean
    workspace_configured: boolean
    workspace_id?: string
    region: string
    region_label: string
    http_base?: string
  }
  output_directory: string
  spending: {
    warn_above: number
    daily_cap: number
    today?: number
    month?: number
    total?: number
  }
  speech: {
    fix_dates_phones: boolean
    day_first: boolean
    synth_flags: Record<string, boolean>
    supported_flags: Record<string, string>
    extra_params: string
  }
  naming: Record<string, string | number | boolean>
  naming_tokens: string[]
  database: Record<string, unknown>
  storage: Record<string, unknown>
  storage_settings: Record<string, unknown>
}

export type PronunciationRule = {
  id: number
  pattern: string
  replacement: string
  whole_word: boolean
  match_case: boolean
  enabled: boolean
  phoneme: boolean
}

export type DiskSnapshot = {
  finished: { bytes: number; files: number; where: string }
  scratch: Record<string, { bytes: number; files: number; what: string }>
  scratch_total: number
  protected: Record<string, { bytes: number; files: number; what: string }>
  protected_total: number
  keep_days: number
}

export type VentureOverview = {
  resource: WorkResource
  projects: ProjectSummary[]
  recent_productions: ProductionSummary[]
  asset_summary: { total: number; duration_ms: number; by_kind: Record<string, { collection_id: number; name: string; count: number; duration_ms: number }> }
}

export type ProjectOverview = {
  resource: WorkResource
  trail: TrailItem[]
  series: SeriesSummary[]
  standalone_productions: ProductionSummary[]
  metrics: WorkMetrics
}

export type SeriesOverview = {
  resource: WorkResource
  trail: TrailItem[]
  defaults: Record<string, unknown>
  productions: ProductionSummary[]
  metrics: WorkMetrics
}

export type ProductionPart = {
  id: number
  created_at: string
  position: number | null
  kind: "audio" | "speech" | "draft" | "silence" | "asset" | "stitch" | string
  title?: string | null
  text: string
  text_raw?: string
  text_shaped?: string
  text_tagged?: string
  text_state?: "raw" | "shaped" | "tagged" | string
  voice?: string
  voice_identity_id?: string | null
  engine?: string
  model?: string
  format?: string
  language?: string
  instruction?: string
  rate?: number
  pitch?: number
  volume?: number
  seed?: number
  filename?: string
  size_bytes?: number
  chars?: number
  cost: number
  spent?: number
  duration_ms?: number | null
  asset_of?: number | null
  asset_id?: number | null
  asset_version_id?: number | null
  speech_mode?: "exact" | "directed" | string
  cost_basis?: string
  provider_text?: string | null
  fidelity?: FidelityResult
  takes?: number
  subtitled?: boolean
  subtitles_stale?: boolean
  languages?: string[]
  missing?: boolean
}

export type ProductionExport = {
  id: number
  production_id: number
  generation_id: number | null
  filename: string
  manifest: Record<string, unknown>
  renderer: string
  duration_ms: number | null
  size_bytes: number
  created_at: string
}

export type Production = {
  id: number
  public_id: string
  key: string
  type: "production"
  name: string
  description: string
  status: "draft" | "in_progress" | "review" | "approved" | "released" | "archived" | string
  project_id?: number
  series_id: number | null
  legacy_container_id: number
  updated_at?: string
  trail: TrailItem[]
  parts: ProductionPart[]
  exports: ProductionExport[]
  total_cost: number
  current_sequence_cost: number
  accounting: {
    historical_spend: number
    current_sequence_cost: number
    retained_generation_cost: number
    tracked_spend: number
    untracked_legacy_spend: number
  }
  total_bytes: number
}

export type MusicBed = {
  music_of?: number | null
  level?: "discreet" | "present" | "loud" | string
  fade_in?: number
  fade_out?: number
  duck?: boolean
  volume?: number
  start?: number
  filename?: string
  name?: string
  duration_ms?: number | null
}

export type VentureAsset = {
  id: number
  name?: string
  title?: string
  text?: string
  folder?: string
  collection?: string
  kind?: string
  filename?: string
  duration_ms?: number | null
  missing?: boolean
  [key: string]: unknown
}

export type AssetCollection = { id: number; venture_id: number; kind: string; name: string }
export type VentureAssetLibrary = { venture: WorkResource; collections: AssetCollection[]; assets: VentureAsset[] }

export type PreviewResult = {
  url?: string
  filename?: string
  duration_ms?: number
  cached?: boolean
  error?: string
}

export type StudioConfig = {
  voices: Record<"plus" | "flash", Record<string, string>>
  default_voice: Record<"plus" | "flash", string>
  chosen_default_voice?: string
  formats: string[]
  languages: string[]
  instruction_max: number
  has_key: boolean
  workspace?: { configured: boolean; id?: string; region: string; region_label: string; http_base?: string }
  prefs?: { warn_above?: number; daily_cap?: number }
  voice_images?: Record<string, string>
  tags?: Record<string, Record<string, string> | string[]>
  retired_tags?: Record<string, string> | string[]
  capabilities: Record<string, {
    label: string
    purpose: string
    models: Record<"plus" | "flash", string>
    system_languages: string[]
    system_voices?: Record<string, string>
    clone_tiers?: string[]
    clone_languages?: Record<string, string>
    exact_text: boolean
    inline_tags?: boolean
    instruction_control?: boolean
    fidelity_check?: boolean
    estimate_rates_per_million_chars: Record<string, number>
  }>
}

export type ClonedVoice = {
  voice_id?: string
  voice?: string
  engine?: "audio" | "omni"
  target_model?: string
  targetModel?: string
  name?: string
  [key: string]: unknown
}

export type VoiceMeta = components["schemas"]["VoiceMetadataResponse"]

export type VoiceCatalogItem = {
  id: string
  tier?: "plus" | "flash" | string
  name?: string
  gender?: string
  age?: number | string
  trait?: string
  scene?: string
  language?: string
  sample?: string
}

export type VoiceBinding = {
  identity_id: string
  provider_voice_id: string
  name: string
  description: string
  languages: string[]
  source: "system" | "custom"
  provider: string
  engine: "audio" | "omni"
  tier: "plus" | "flash"
  model_id: string
  status: string
  image?: string
  gender?: string
  age?: number | null
  accent?: string
  scene?: string
  reference?: { id?: string; identity_id?: string; original_name?: string; original_path?: string; normalized_path?: string }
}

export type VoiceModelSummary = {
  engine: "audio" | "omni"
  tier: "plus" | "flash"
  model_id: string
  label: string
  system_count: number
  custom_count: number
  total_count: number
  clone_supported: boolean
}

export type PerformancePreset = {
  id: string
  name: string
  instruction: string
  engines: Array<"audio" | "omni">
}

export type VoiceRegistry = components["schemas"]["VoiceRegistryResponse"]

export type VoicePackageRoute = components["schemas"]["VoicePackageRouteResponse"]

export type VoicePackagePlan = components["schemas"]["VoicePackagePlanResponse"]

export type VoiceProfileBinding = components["schemas"]["VoiceProfileBindingResponse"]

export type VoicePackageJob = components["schemas"]["VoicePackageJobResponse"]

export type VoiceProfile = components["schemas"]["VoiceProfileResponse"]

export type VoiceDirectory = {
  config: StudioConfig | null
  cloned: ClonedVoice[]
  meta: Record<string, VoiceMeta>
  catalog: VoiceCatalogItem[]
  registry?: VoiceRegistry | null
  identities?: VoiceProfile[]
  usage?: Record<string, { uses: number; folders: number; spend: number; last_used?: string | null; mine?: string | null }>
}

export type RenderTask = {
  id: string
  mode: "new" | "draft" | "take"
  status: "generating" | "failed"
  payload: GeneratePayload
  text: string
  voice: string
  insertAt: number | null
  targetPartId?: number
  startedAt: number
  error?: string
}

export type Take = {
  id: number
  when: string
  voice: string
  voice_identity_id?: string | null
  model: string
  rate: number
  pitch: number
  seed: number
  filename: string
  size_bytes: number
  cost: number
  text: string
  duration_ms?: number | null
  instruction?: string
  language?: string
  fidelity?: FidelityResult
}

export type HistoricalVoiceReference = components["schemas"]["HistoricalVoiceResponse"]

export type TranscriptSummary = {
  id: number
  name: string
  language?: string
  duration_ms?: number
  is_translation: boolean
  stale: boolean
}

export type Transcript = components["schemas"]["SubtitleResponse"]

export type CaptionProfile = components["schemas"]["CaptionProfileResponse"]["key"]

export type CaptionWord = components["schemas"]["CaptionWordResponse"]

export type CaptionCue = components["schemas"]["CaptionCueResponse"]

export type CaptionLayout = components["schemas"]["CaptionLayoutResponse"]

export type ExternalTranscriptSummary = components["schemas"]["SubtitleSummaryResponse"]

export type ExternalAudioUpload = components["schemas"]["UploadedTranscriptionSourceResponse"]

export type BatchPreview = components["schemas"]["BatchPreviewResponse"]

export type BatchResult = {
  results: Array<{ row: number; name?: string; text: string; url?: string; cost?: number; error?: string; warning?: string }>
  cost: number
  estimated_cost?: number
  cost_basis?: string
  folder: string
  zip?: string | null
  made: number
  failed: number
  needs_confirmation?: boolean
  estimate?: number
  failures?: Array<{ row: number; error: string }>
}

export type DurableJob<T = Record<string, unknown>> = {
  id: string
  type: string
  status: "queued" | "running" | "retrying" | "ok" | "warning" | "failed" | "blocked" | "lost" | "cancelled"
  progress: number
  detail: string
  error?: string | null
  retries: number
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  result: T
}

export type GeneratePayload = {
  text: string
  text_raw?: string | null
  text_shaped?: string | null
  text_tagged?: string | null
  text_state?: "raw" | "shaped" | "tagged"
  production_id?: number
  insert_at: number | null
  voice: string
  voice_identity_id?: string | null
  engine: "audio" | "omni"
  model: "plus" | "flash"
  format: string
  language: string
  instruction: string
  speech_mode: "exact" | "directed"
  rate: number
  pitch: number
  volume: number
  seed: number
  confirmed?: boolean
}

export type VoiceRouteDecision = {
  identity_id?: string | null
  provider_voice_id: string
  engine: "audio" | "omni"
  tier: "plus" | "flash"
  model_id: string
  reason: string
  registry_matched: boolean
}

export type GenerateResult = {
  id?: number
  url?: string
  name?: string
  cost?: number
  cost_basis?: string
  warning?: string
  returned_text?: string
  fidelity?: FidelityResult
  failures?: Array<{ index: number; text: string; error: string }>
  needs_confirmation?: boolean
  estimate?: number
  voice_route?: VoiceRouteDecision
}

export type FidelityResult = {
  status: "pass" | "warning" | "failed" | "unverified" | "unknown"
  score: number | null
  coverage: number | null
  precision?: number | null
  requested_words: number
  returned_words: number
  message: string
}

export type TextDifference = { kind: "same" | "added" | "removed" | string; text: string }

export type TextPassResult = {
  before?: string
  after?: string
  difference?: TextDifference[]
  cost?: number
  style_used?: boolean
  needs_confirmation?: boolean
  estimate?: number
  model?: string
  usage?: Record<string, unknown>
  provider_request_id?: string | null
  provider_region?: string | null
  provider_endpoint?: string | null
  cost_basis?: string
  price_version?: string
}

export type CaptionMutationResult = Transcript & {
  needs_confirmation?: boolean
  estimate?: number
}

export type LoadState<T> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string }

export type PlayerSource = {
  key: string
  url: string
  title: string
  subtitle?: string
  artwork?: string
  kind: "part" | "asset" | "music" | "preview" | "voice"
}
