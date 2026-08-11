import type { components } from "./api.generated"

export type ResourceType = "venture" | "project" | "series" | "production"

export type HierarchyNode = components["schemas"]["HierarchyNodeResponse"]

export type TrailItem = components["schemas"]["TrailItemResponse"]

export type ProductionSummary = components["schemas"]["ProductionSummaryResponse"]

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

export type SeriesSummary = components["schemas"]["SeriesSummaryResponse"]

export type ProjectSummary = components["schemas"]["ProjectSummaryResponse"]

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

export type SettingsSnapshot = components["schemas"]["SettingsSnapshotResponse"]

export type PronunciationRule = components["schemas"]["PronunciationRuleResponse"]

export type DiskSnapshot = components["schemas"]["DiskSnapshotResponse"]

export type VentureOverview = components["schemas"]["VentureOverviewResponse"]

export type ProjectOverview = components["schemas"]["ProjectOverviewResponse"]

export type SeriesOverview = components["schemas"]["SeriesOverviewResponse"]

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
  binding_id?: string | null
  catalogue_voice_id?: string | null
  capability_id?: string | null
  cast_role_id?: string | null
  cast_role_name?: string | null
  revision?: number
  selected_take_id?: number | null
  outdated?: boolean
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
  filename: string
  manifest: Record<string, unknown>
  renderer: string
  duration_ms: number | null
  size_bytes: number
  created_at: string
}

export type ProductionCastRole = {
  id: string
  name: string
  color: string
  position: number | null
  persona_id: string | null
  persona_name: string | null
  voice_source_kind: "identity" | "catalogue"
  voice_identity_id: string | null
  catalogue_voice_id: string | null
  assignment_revision: number
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
  clone_languages?: Record<string, string>
  instruction_max: number
  text_preparation?: {
    model: string
    reasoning: boolean
    input_price_per_million_tokens: number
    output_price_per_million_tokens: number
    estimated_price_per_million_characters: number
  }
  has_key: boolean
  workspace?: { configured: boolean; id?: string; region: string; region_label: string; http_base?: string }
  prefs?: { warn_above?: number; daily_cap?: number }
  voice_images?: Record<string, string>
  tags?: Record<string, Record<string, string> | string[]>
  retired_tags?: Record<string, string> | string[]
  capabilities: Record<string, {
    label: string
    operator_title?: string
    purpose: string
    operator_notes?: string[]
    models: Record<string, string>
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
  engine?: "audio" | "omni" | "qwen_tts"
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
  region: string
  engine: "audio" | "omni" | "qwen_tts"
  tier: "plus" | "flash" | "vc"
  model_id: string
  status: string
  binding_id?: string | null
  catalogue_voice_id?: string | null
  capabilities?: Array<Record<string, string>>
  image?: string
  gender?: string
  age?: number | null
  accent?: string
  scene?: string
  reference_id?: string | null
  reference?: { id?: string; identity_id?: string; original_name?: string; original_path?: string; normalized_path?: string; source_language?: string }
}

export type VoiceModelSummary = {
  engine: "audio" | "omni" | "qwen_tts"
  tier: "plus" | "flash" | "vc"
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
  engines: Array<"audio" | "omni" | "qwen_tts">
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
  engine: string
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
  binding_id?: string | null
  catalogue_voice_id?: string | null
  capability_id?: string | null
  cast_role_id?: string | null
  voice_identity_id?: string | null
  engine: "audio" | "omni" | "qwen_tts"
  model: "plus" | "flash" | "vc"
  format: string
  language: string
  instruction: string
  speech_mode: "exact" | "directed"
  rate: number
  pitch: number
  volume: number
  seed: number
  confirmed?: boolean
  session_id?: string
}

export type VoiceRouteDecision = {
  binding_id?: string | null
  catalogue_voice_id?: string | null
  identity_id?: string | null
  provider_voice_id: string
  engine: "audio" | "omni" | "qwen_tts"
  tier: "plus" | "flash" | "vc"
  model_id: string
  capability_id?: string | null
}

export type GenerateResult = {
  job_id?: string
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

export type RecordingAttempt = {
  id: string
  status: DurableJob["status"]
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  request: GeneratePayload
  error: string
  warning: string
  cost: number
  cost_basis: string
  duration_ms: number
  size_bytes: number
  audio_url?: string | null
  fidelity?: FidelityResult | null
}

export type RecordingSession = {
  id: string
  attempts: RecordingAttempt[]
  total_cost: number
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
  estimated_cost?: number
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
