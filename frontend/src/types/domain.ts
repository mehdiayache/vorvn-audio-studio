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

export type SeriesSummary = components["schemas"]["ProjectSeriesSummaryResponse"]

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
  public_id?: string
  created_at: string
  position: number | null
  enabled?: boolean
  kind: "audio" | "speech" | "draft" | "silence" | "asset" | "stitch" | string
  title?: string | null
  authored_role?: string | null
  text: string
  text_raw?: string
  text_shaped?: string
  text_tagged?: string
  text_state?: "raw" | "shaped" | "tagged" | string
  spoken_profile?: "spoken_1" | "spoken_2" | null
  voice?: string
  voice_name?: string
  clip_public_id?: string | null
  voice_identity_id?: string | null
  binding_id?: string | null
  catalogue_voice_id?: string | null
  capability_id?: string | null
  capability_name?: string | null
  reference_id?: string | null
  provider?: string | null
  provider_region?: string | null
  tier?: string | null
  provider_attempt_id?: string | null
  provider_attempt_status?: string | null
  binding_resolution_status?: string | null
  clip_raw_text?: string | null
  clip_spoken_text?: string | null
  clip_tagged_text?: string | null
  clip_delivery?: Record<string, unknown>
  clip_usage?: Record<string, unknown>
  clip_segmentation?: Record<string, unknown>
  revision?: number
  clip_id?: number | null
  recording_text_state?: "raw" | "shaped" | "tagged" | string | null
  editorial_status?: string | null
  speech_job?: (DurableJob<GenerateResult> & { request: GeneratePayload }) | null
  caption_job?: DurableJob<CaptionMutationResult> | null
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
  enable_ssml?: boolean
  filename?: string
  size_bytes?: number
  chars?: number
  cost: number
  spent?: number
  duration_ms?: number | null
  asset_of?: number | null
  asset_id?: number | null
  asset_version_id?: number | null
  asset_kind?: string | null
  asset_collection?: string | null
  speech_mode?: "exact" | "directed" | string
  cost_basis?: string
  subtitled?: boolean
  subtitles_stale?: boolean
  caption_source_language?: string | null
  languages?: string[]
  missing?: boolean
}

export type PartEditorialUpdate = {
  expected_revision: number
  script?: string
  authored_role?: string | null
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
  updated_at?: string
  trail: TrailItem[]
  parts: ProductionPart[]
  exports: ProductionExport[]
  export_job?: DurableJob<{ url?: string; name?: string; error?: string }> | null
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

export type SoundSceneAnchor =
  | { kind: "absolute"; position_ms: number }
  | { kind: "part"; part_public_id: string; edge: "start" | "end"; offset_ms: number }

export type SoundSceneClip = {
  id: string
  asset_id: number
  asset_version_id?: number | null
  start_ms: number
  duration_ms: number | null
  source_offset_ms: number
  gain: number
  fade_in_ms: number
  fade_out_ms: number
  loop: boolean
  ducking: boolean
  anchor: SoundSceneAnchor
  asset_name?: string
  asset_kind?: string
  filename?: string
  source_duration_ms?: number
  missing?: boolean
  resolved_start_ms?: number | null
  resolved_duration_ms?: number
  orphan?: boolean
  orphan_reason?: string | null
}

export type SoundSceneTrack = {
  id: string
  kind: "music" | "sfx" | "ambience"
  name: string
  volume: number
  muted: boolean
  clips: SoundSceneClip[]
}

export type SoundSceneDocument = { version: 1; tracks: SoundSceneTrack[] }

export type SequenceProjectionSpan = {
  part_id: number
  part_public_id: string
  position?: number | null
  kind: string
  title: string
  role: string
  voice_name: string
  filename: string
  start_ms: number
  duration_ms: number
  silence: boolean
  missing: boolean
}

export type SoundScene = {
  production_id: number
  revision: number
  document: SoundSceneDocument
  can_undo: boolean
  can_redo: boolean
  updated_at: string
  resolved: {
    version: 1
    signature: string
    sequence_projection: {
      signature: string
      duration_ms: number
      sample_rate: number
      spans: SequenceProjectionSpan[]
    }
    tracks: SoundSceneTrack[]
    orphans: { track_id: string; clip_id: string; reason: string }[]
  }
  sequence_stem: {
    url: string
    filename: string
    duration_ms: number
    signature: string
    cached: boolean
  }
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
  name?: string
  filename?: string
  duration_ms?: number
  parts?: number
  music?: boolean
  skipped_drafts?: number
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
    inline_tags?: boolean
    instruction_control?: boolean
    estimate_rates_per_million_chars: Record<string, number>
  }>
}

export type ClonedVoice = {
  voice_id?: string
  voice?: string
  engine?: string
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
  adapter_key: string
  engine: string
  tier: string
  model_id: string
  status: string
  estimate_rate_per_million_chars: number
  binding_id?: string | null
  catalogue_voice_id?: string | null
  capabilities?: components["schemas"]["VoiceCapabilityResponse"][]
  image?: string
  gender?: string
  age?: number | null
  accent?: string
  scene?: string
  reference_id?: string | null
  reference?: { id?: string; identity_id?: string; original_name?: string; original_path?: string; normalized_path?: string; source_language?: string }
}

export type VoiceModelSummary = {
  engine: string
  tier: string
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
  capability_ids: string[]
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
  usage?: Record<string, { uses: number; folders: number; spend: number; last_used?: string | null; latest_preview?: string | null }>
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
  part_id?: number | null
  context?: {
    part_id?: number | null
    production_id?: number | null
    transcript_id?: number | null
    target?: string
    language?: string
    operation?: string
    confirmed?: boolean
  }
}

/**
 * Provider-neutral speech command accepted by the public API. The exact
 * provider route is identified only by binding_id or catalogue_voice_id.
 * Provider voice, engine and model are server-resolved snapshot facts.
 */
type SpeechJobCreateRequest = components["schemas"]["SpeechJobCreate"]

export type GeneratePayload = Omit<
  SpeechJobCreateRequest,
  "part_id" | "confirmed" | "text_state" | "spoken_profile" | "enable_ssml"
> & Partial<Pick<
  SpeechJobCreateRequest,
  "confirmed" | "text_state" | "spoken_profile" | "enable_ssml"
>>

export type ResolvedGeneratePayload = GeneratePayload & {
  voice?: string
  engine?: string
  model?: string
  model_id?: string
  provider?: string
  provider_region?: string
}

export type VoiceRouteDecision = {
  binding_id?: string | null
  catalogue_voice_id?: string | null
  identity_id?: string | null
  provider_voice_id: string
  engine: string
  tier: string
  model_id: string
  capability_id?: string | null
}

export type GenerateResult = components["schemas"]["SpeechGenerateResultResponse"] & {
  job_id?: string
  id?: number
  url?: string
  name?: string
  cost?: number
  cost_basis?: string
  warning?: string
  failures?: Array<{ index: number; text: string; error: string }>
  needs_confirmation?: boolean
  requires_review?: boolean
  ambiguous?: boolean
  estimate?: number
  estimated_cost?: number
  voice_route?: VoiceRouteDecision
}

export type RecordingAttempt = {
  id: string
  status: DurableJob["status"]
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  request: ResolvedGeneratePayload
  error: string
  warning: string
  cost: number
  cost_basis: string
  duration_ms: number
  size_bytes: number
  audio_url?: string | null
  needs_confirmation: boolean
  requires_review: boolean
  estimate: number
  continued_by_job_id?: string | null
}

export type RecordingHistory = {
  recordings: RecordingAttempt[]
  total_cost: number
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
  spoken_profile?: "spoken_1" | "spoken_2" | null
}

export type CaptionMutationResult = Transcript & {
  part_id?: number | null
  clip_id?: number | null
  needs_confirmation?: boolean
  estimate?: number
  requires_review?: boolean
  ambiguous?: boolean
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
  kind: "clip" | "production" | "voice" | "asset" | "music" | "subtitle" | "standalone"
  captionTracks?: PlayerCaptionTrack[]
}

export type PlayerCaptionCue = {
  startMs: number
  endMs: number
  text: string
  partId?: number
}

export type PlayerCaptionTrack = {
  id: string
  language: string
  label: string
  stale: boolean
  cues: PlayerCaptionCue[]
  presentations?: Record<CaptionProfile, PlayerCaptionCue[]>
}
