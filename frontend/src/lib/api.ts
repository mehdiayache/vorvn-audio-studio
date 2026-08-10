import type {
  MusicBed,
  PreviewResult,
  Production,
  ProductionPart,
  HierarchyNode,
  ProductionSummary,
  VentureAsset,
  StudioConfig,
  GeneratePayload,
  GenerateResult,
  Take,
  Transcript,
  TranscriptSummary,
  TextPassResult,
  CaptionMutationResult,
  AssetCollection,
  ActivitySnapshot,
  ExternalAudioUpload,
  CaptionProfile,
  BatchResult,
  DurableJob,
  VentureAssetLibrary,
} from "@/types/domain"
import type { paths } from "@/types/api.generated"
import { ApiError } from "@/lib/api-error"
import { observeJob } from "@/lib/job-observer"

type GeneratedJob = paths["/api/v1/jobs/{job_id}"]["get"]["responses"][200]["content"]["application/json"]["data"]
type UploadedImage = paths["/api/v1/project-covers/upload"]["post"]["responses"][200]["content"]["application/json"]["data"]
type UploadedVoiceReference = paths["/api/v1/voice-references/upload"]["post"]["responses"][200]["content"]["application/json"]["data"]
type UploadedAsset = paths["/api/v1/asset-collections/{collection_id}/assets/upload"]["post"]["responses"][201]["content"]["application/json"]["data"]
type BatchPreviewEnvelope = paths["/api/v1/batches/preview"]["post"]["responses"][200]["content"]["application/json"]
type SubtitleListEnvelope = paths["/api/v1/subtitles"]["get"]["responses"][200]["content"]["application/json"]
type SubtitleEnvelope = paths["/api/v1/subtitles/{transcript_id}"]["get"]["responses"][200]["content"]["application/json"]
type SubtitleDeletedEnvelope = paths["/api/v1/subtitles/{transcript_id}"]["delete"]["responses"][200]["content"]["application/json"]
type CaptionLayoutEnvelope = paths["/api/v1/subtitles/{transcript_id}/layouts/{profile}"]["get"]["responses"][200]["content"]["application/json"]
type VoiceRegistryEnvelope = paths["/api/v1/voice-registry"]["get"]["responses"][200]["content"]["application/json"]
type VoiceMetadataEnvelope = paths["/api/v1/voice-meta"]["get"]["responses"][200]["content"]["application/json"]
type VoiceUsageEnvelope = paths["/api/v1/voice-usage"]["get"]["responses"][200]["content"]["application/json"]
type VoiceRouteEnvelope = paths["/api/v1/voice-routes/resolve"]["post"]["responses"][200]["content"]["application/json"]
type VoiceRouteBody = paths["/api/v1/voice-routes/resolve"]["post"]["requestBody"]["content"]["application/json"]
type VoiceProfileCollectionEnvelope = paths["/api/v1/voices"]["get"]["responses"][200]["content"]["application/json"]
type VoiceProfileEnvelope = paths["/api/v1/voices/{identity_id}"]["get"]["responses"][200]["content"]["application/json"]
type VoiceUpdateBody = paths["/api/v1/voices/{identity_id}"]["patch"]["requestBody"]["content"]["application/json"]
type HistoricalVoiceCollectionEnvelope = paths["/api/v1/voice-history/unlinked"]["get"]["responses"][200]["content"]["application/json"]
type VoiceHistoryLinkEnvelope = paths["/api/v1/voices/{identity_id}/link-history"]["post"]["responses"][200]["content"]["application/json"]
type VoiceHistoryLinkBody = paths["/api/v1/voices/{identity_id}/link-history"]["post"]["requestBody"]["content"]["application/json"]
type VoicePackagePlanEnvelope = paths["/api/v1/voice-packages/preflight"]["post"]["responses"][200]["content"]["application/json"]
type VoicePackagePreflightBody = paths["/api/v1/voice-packages/preflight"]["post"]["requestBody"]["content"]["application/json"]
type VoicePackageCreateEnvelope = paths["/api/v1/voice-packages"]["post"]["responses"][202]["content"]["application/json"]
type VoicePackageCreateBody = paths["/api/v1/voice-packages"]["post"]["requestBody"]["content"]["application/json"]
type VoicePackageRetryEnvelope = paths["/api/v1/voice-packages/retry"]["post"]["responses"][202]["content"]["application/json"]
type VoicePackageRetryBody = paths["/api/v1/voice-packages/retry"]["post"]["requestBody"]["content"]["application/json"]
type SettingsEnvelope = paths["/api/v1/settings"]["get"]["responses"][200]["content"]["application/json"]
type SettingsUpdateBody = paths["/api/v1/settings"]["patch"]["requestBody"]["content"]["application/json"]
type ProviderUpdateBody = paths["/api/v1/settings/provider"]["patch"]["requestBody"]["content"]["application/json"]
type StorageUpdateBody = paths["/api/v1/settings/storage"]["patch"]["requestBody"]["content"]["application/json"]
type StorageTestEnvelope = paths["/api/v1/settings/storage/test"]["post"]["responses"][200]["content"]["application/json"]
type MaintenanceEnvelope = paths["/api/v1/settings/maintenance"]["get"]["responses"][200]["content"]["application/json"]
type TidyEnvelope = paths["/api/v1/settings/maintenance/tidy"]["post"]["responses"][200]["content"]["application/json"]
type PronunciationListEnvelope = paths["/api/v1/settings/pronunciations"]["get"]["responses"][200]["content"]["application/json"]
type PronunciationSaveEnvelope = paths["/api/v1/settings/pronunciations"]["post"]["responses"][200]["content"]["application/json"]
type PronunciationSaveBody = paths["/api/v1/settings/pronunciations"]["post"]["requestBody"]["content"]["application/json"]
type PronunciationDeleteEnvelope = paths["/api/v1/settings/pronunciations/{item_id}"]["delete"]["responses"][200]["content"]["application/json"]
type PronunciationPreviewEnvelope = paths["/api/v1/settings/pronunciations/preview"]["get"]["responses"][200]["content"]["application/json"]
type HierarchyPageEnvelope = paths["/api/v1/hierarchy"]["get"]["responses"][200]["content"]["application/json"]
type VentureOverviewEnvelope = paths["/api/v1/ventures/{resource_id}/overview"]["get"]["responses"][200]["content"]["application/json"]
type VentureAssetsEnvelope = paths["/api/v1/ventures/{resource_id}/assets"]["get"]["responses"][200]["content"]["application/json"]
type ProjectOverviewEnvelope = paths["/api/v1/projects/{resource_id}/overview"]["get"]["responses"][200]["content"]["application/json"]
type SeriesOverviewEnvelope = paths["/api/v1/series/{resource_id}/overview"]["get"]["responses"][200]["content"]["application/json"]
type TimelineReorderEnvelope = paths["/api/v1/productions/{production_id}/parts/reorder"]["post"]["responses"][200]["content"]["application/json"]
type TimelinePartEnvelope = paths["/api/v1/productions/{production_id}/parts/silence"]["post"]["responses"][200]["content"]["application/json"]
type TimelineDeleteEnvelope = paths["/api/v1/productions/{production_id}/parts"]["delete"]["responses"][200]["content"]["application/json"]
type TimelineMoveEnvelope = paths["/api/v1/productions/{production_id}/parts/move"]["post"]["responses"][200]["content"]["application/json"]
type TimelineOkEnvelope = paths["/api/v1/productions/{production_id}/parts/{part_id}/text"]["patch"]["responses"][200]["content"]["application/json"]

export { ApiError } from "@/lib/api-error"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string | { message?: string } }
  if (!response.ok || body.error) {
    const message = typeof body.error === "string" ? body.error : body.error?.message
    throw new ApiError(message || `Request failed (${response.status})`, response.status)
  }
  return body
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) })
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "X-Filename": encodeURIComponent(file.name) },
    body: file,
  })
  const body = (await response.json().catch(() => ({}))) as T & { error?: string | { message?: string } }
  const message = typeof body.error === "string" ? body.error : body.error?.message
  if (!response.ok || body.error) throw new ApiError(message || `Upload failed (${response.status})`, response.status)
  return body
}

function v1<T>(path: string) {
  return request<{ data: T }>(path).then((response) => response.data)
}

function postV1<T>(path: string, body: unknown) {
  return post<{ data: T }>(path, body).then((response) => response.data)
}

async function waitForJob<T>(jobId: string): Promise<T> {
  return observeJob<T>(jobId, (id) => v1<GeneratedJob>(`/api/v1/jobs/${encodeURIComponent(id)}`))
}

export const studioApi = {
  config: () => v1<StudioConfig>("/api/v1/config"),
  activity: (filters: { kind?: string; failed?: boolean; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (filters.kind) query.set("kind", filters.kind)
    if (filters.failed) query.set("failed", "true")
    if (filters.limit) query.set("limit", String(filters.limit))
    return v1<ActivitySnapshot>(`/api/v1/activity${query.size ? `?${query}` : ""}`)
  },
  settings: () => request<SettingsEnvelope>("/api/v1/settings").then((response) => response.data),
  updateSettings: (changes: SettingsUpdateBody) => request<SettingsEnvelope>("/api/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(changes),
  }).then((response) => response.data),
  resetNaming: () => request<SettingsEnvelope>("/api/v1/settings/naming/reset", { method: "POST", body: JSON.stringify({}) }).then((response) => response.data),
  updateProviderSettings: (changes: ProviderUpdateBody) => request<SettingsEnvelope>("/api/v1/settings/provider", { method: "PATCH", body: JSON.stringify(changes) }).then((response) => response.data),
  updateStorageSettings: (changes: StorageUpdateBody) => request<SettingsEnvelope>("/api/v1/settings/storage", { method: "PATCH", body: JSON.stringify(changes) }).then((response) => response.data),
  testStorage: () => request<StorageTestEnvelope>("/api/v1/settings/storage/test", { method: "POST", body: JSON.stringify({}) }).then((response) => response.data),
  maintenance: () => request<MaintenanceEnvelope>("/api/v1/settings/maintenance").then((response) => response.data),
  tidyWorkingFiles: (days = 7) => request<TidyEnvelope>(`/api/v1/settings/maintenance/tidy?days=${days}`, { method: "POST", body: JSON.stringify({}) }).then((response) => response.data),
  pronunciations: () => request<PronunciationListEnvelope>("/api/v1/settings/pronunciations").then((response) => response.data),
  savePronunciation: (rule: PronunciationSaveBody) => request<PronunciationSaveEnvelope>("/api/v1/settings/pronunciations", { method: "POST", body: JSON.stringify(rule) }).then((response) => response.data),
  deletePronunciation: (id: number) => request<PronunciationDeleteEnvelope>(`/api/v1/settings/pronunciations/${id}`, { method: "DELETE" }).then((response) => response.data),
  previewPronunciation: (text: string) => request<PronunciationPreviewEnvelope>(`/api/v1/settings/pronunciations/preview?text=${encodeURIComponent(text)}`).then((response) => response.data),
  externalTranscripts: () => request<SubtitleListEnvelope>("/api/v1/subtitles").then((response) => response.data),
  externalTranscript: (id: number) => request<SubtitleEnvelope>(`/api/v1/subtitles/${id}`).then((response) => response.data),
  subtitleLayout: (id: number, profile: CaptionProfile) => request<CaptionLayoutEnvelope>(`/api/v1/subtitles/${id}/layouts/${profile}`).then((response) => response.data),
  deleteExternalTranscript: (id: number) => request<SubtitleDeletedEnvelope>(`/api/v1/subtitles/${id}`, { method: "DELETE" }),
  uploadExternalAudio: (file: File) => uploadFile<{ data: ExternalAudioUpload }>("/api/v1/subtitles/uploads", file).then((response) => response.data),
  transcribeExternal: async (payload: { url: string; name: string; playable: string; size_bytes: number; duration_ms: number; language?: string; enable_itn?: boolean; confirmed?: boolean }) => {
    const response = await request<{ data: DurableJob<CaptionMutationResult> }>("/api/v1/jobs/transcription", { method: "POST", headers: { "Idempotency-Key": `transcribe-${crypto.randomUUID()}` }, body: JSON.stringify(payload) })
    return waitForJob<CaptionMutationResult>(response.data.id)
  },
  previewBatch: (file: File) => uploadFile<BatchPreviewEnvelope>("/api/v1/batches/preview", file).then((response) => response.data),
  runBatch: async (payload: Record<string, unknown>) => {
    const response = await request<{ data: DurableJob<BatchResult> }>("/api/v1/jobs/batch", { method: "POST", headers: { "Idempotency-Key": `batch-${crypto.randomUUID()}` }, body: JSON.stringify(payload) })
    return waitForJob<BatchResult>(response.data.id)
  },
  voiceRegistry: () => request<VoiceRegistryEnvelope>("/api/v1/voice-registry").then((response) => response.data),
  voiceMeta: () => request<VoiceMetadataEnvelope>("/api/v1/voice-meta").then((response) => ({ voices: response.data })),
  voiceUsage: () => request<VoiceUsageEnvelope>("/api/v1/voice-usage").then((response) => ({ usage: response.data })),
  voiceProfiles: () => request<VoiceProfileCollectionEnvelope>("/api/v1/voices?limit=100").then((response) => response.data),
  unlinkedVoiceHistory: () => request<HistoricalVoiceCollectionEnvelope>("/api/v1/voice-history/unlinked?limit=100").then((response) => response.data),
  linkVoiceHistory: (identityId: string, providerVoiceId: string) =>
    request<VoiceHistoryLinkEnvelope>(`/api/v1/voices/${encodeURIComponent(identityId)}/link-history`, { method: "POST", body: JSON.stringify({ provider_voice_id: providerVoiceId } satisfies VoiceHistoryLinkBody) }).then((response) => response.data),
  resolveVoiceRoute: (payload: VoiceRouteBody) =>
    request<VoiceRouteEnvelope>("/api/v1/voice-routes/resolve", { method: "POST", body: JSON.stringify(payload) }).then((response) => response.data),
  voiceProfile: (identityId: string) => request<VoiceProfileEnvelope>(`/api/v1/voices/${encodeURIComponent(identityId)}`).then((response) => response.data),
  updateVoiceProfile: (identityId: string, changes: VoiceUpdateBody) => request<VoiceProfileEnvelope>(`/api/v1/voices/${encodeURIComponent(identityId)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  }).then((response) => response.data),
  archiveVoiceProfile: (identityId: string) => request<VoiceProfileEnvelope>(`/api/v1/voices/${encodeURIComponent(identityId)}`, { method: "DELETE" }).then((response) => response.data),
  uploadVoiceImage: (file: File) => uploadFile<{ data: UploadedImage }>("/api/v1/voice-images/upload", file).then((response) => response.data),
  voicePackagePreflight: (language: string, packageId: VoicePackagePreflightBody["package"]) => request<VoicePackagePlanEnvelope>("/api/v1/voice-packages/preflight", { method: "POST", body: JSON.stringify({ language, package: packageId } satisfies VoicePackagePreflightBody) }).then((response) => response.data),
  createVoicePackage: async (payload: VoicePackageCreateBody) => {
    const response = await request<VoicePackageCreateEnvelope>("/api/v1/voice-packages", { method: "POST", body: JSON.stringify(payload) })
    if ("needs_confirmation" in response.data) throw new ApiError("Voice creation requires cost confirmation.", 409)
    return response.data
  },
  retryVoiceBinding: (identityId: string, modelId: string) => request<VoicePackageRetryEnvelope>("/api/v1/voice-packages/retry", { method: "POST", body: JSON.stringify({ identity_id: identityId, model_id: modelId } satisfies VoicePackageRetryBody) }).then((response) => response.data),
  uploadVoiceReference: (file: File) => uploadFile<{ data: UploadedVoiceReference }>("/api/v1/voice-references/upload", file).then((response) => response.data),
  projects: async () => {
    const items: HierarchyNode[] = []
    let after: string | null = null
    do {
      const response: HierarchyPageEnvelope = await request<HierarchyPageEnvelope>(`/api/v1/hierarchy?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`)
      items.push(...response.data)
      after = response.meta.next_cursor
    } while (after)
    return items
  },
  resource: (type: "ventures" | "projects" | "series", id: number) =>
    v1<HierarchyNode>(`/api/v1/${type}/${id}`),
  ventureOverview: (id: number) => request<VentureOverviewEnvelope>(`/api/v1/ventures/${id}/overview`).then((response) => response.data),
  ventureAssets: (id: number) => request<VentureAssetsEnvelope>(`/api/v1/ventures/${id}/assets`).then((response) => response.data as VentureAssetLibrary),
  projectOverview: (id: number) => request<ProjectOverviewEnvelope>(`/api/v1/projects/${id}/overview`).then((response) => response.data),
  seriesOverview: (id: number) => request<SeriesOverviewEnvelope>(`/api/v1/series/${id}/overview`).then((response) => response.data),
  production: (id: number) => v1<Production>(`/api/v1/productions/${id}/editor`),
  createVenture: (name: string, description = "") => postV1<HierarchyNode>("/api/v1/ventures", { name, description }),
  createProject: (ventureId: number, name: string, description = "") => postV1<HierarchyNode>(`/api/v1/ventures/${ventureId}/projects`, { name, description }),
  createSeries: (projectId: number, name: string, description = "") => postV1<HierarchyNode>(`/api/v1/projects/${projectId}/series`, { name, description }),
  createProduction: (parentType: "projects" | "series", parentId: number, name: string, description = "") => postV1<Production>(`/api/v1/${parentType}/${parentId}/productions`, { name, description }),
  moveProduction: (productionId: number, seriesId: number | null) =>
    request<{ data: ProductionSummary }>(`/api/v1/productions/${productionId}`, { method: "PATCH", body: JSON.stringify({ series_id: seriesId }) }).then((response) => response.data),
  updateResource: <T>(type: "ventures" | "projects" | "series" | "productions", id: number, changes: Record<string, unknown>) =>
    request<{ data: T }>(`/api/v1/${type}/${id}`, { method: "PATCH", body: JSON.stringify(changes) }).then((response) => response.data),
  uploadProjectCover: (file: File) => uploadFile<{ data: UploadedImage }>("/api/v1/project-covers/upload", file).then((response) => response.data),
  uploadVentureLogo: (file: File) => uploadFile<{ data: UploadedImage }>("/api/v1/venture-logos/upload", file).then((response) => response.data),
  archiveResource: (type: "ventures" | "projects" | "series" | "productions", id: number) =>
    request<{ data: unknown }>(`/api/v1/${type}/${id}${type === "series" ? "?strategy=make_standalone" : ""}`, { method: "DELETE" }),
  music: (id: number) => v1<MusicBed>(`/api/v1/productions/${id}/music`),
  assets: (id: number) => v1<{ assets?: VentureAsset[]; collections?: AssetCollection[] }>(`/api/v1/productions/${id}/assets`),
  preview: async (id: number) => {
    const response = await request<{ data: DurableJob<PreviewResult> }>("/api/v1/jobs/render", { method: "POST", headers: { "Idempotency-Key": `preview-${id}-${crypto.randomUUID()}` }, body: JSON.stringify({ production_id: id, operation: "preview" }) })
    return waitForJob<PreviewResult>(response.data.id)
  },
  stitch: async (id: number) => {
    const response = await request<{ data: DurableJob<{ url: string; name: string; error?: string }> }>("/api/v1/jobs/render", { method: "POST", headers: { "Idempotency-Key": `export-${id}-${crypto.randomUUID()}` }, body: JSON.stringify({ production_id: id, operation: "export" }) })
    return waitForJob<{ url: string; name: string; error?: string }>(response.data.id)
  },
  reorder: (id: number, order: number[]) => request<TimelineReorderEnvelope>(`/api/v1/productions/${id}/parts/reorder`, { method: "POST", body: JSON.stringify({ order }) }).then((response) => response.data),
  addSilence: (projectId: number, seconds: number, insertAt: number | null) =>
    request<TimelinePartEnvelope>(`/api/v1/productions/${projectId}/parts/silence`, { method: "POST", body: JSON.stringify({
      seconds,
      insert_at: insertAt,
    }) }).then((response) => response.data),
  editSilence: (productionId: number, id: number, seconds: number) =>
    request<TimelinePartEnvelope>(`/api/v1/productions/${productionId}/parts/${id}/silence`, { method: "PATCH", body: JSON.stringify({ seconds }) }).then((response) => response.data),
  duplicatePart: (productionId: number, id: number) => request<TimelinePartEnvelope>(`/api/v1/productions/${productionId}/parts/${id}/duplicate`, { method: "POST", body: JSON.stringify({}) }).then((response) => response.data),
  deletePart: (productionId: number, id: number) =>
    request<TimelineDeleteEnvelope>(`/api/v1/productions/${productionId}/parts`, { method: "DELETE", body: JSON.stringify({ ids: [id] }) }).then((response) => response.data),
  deleteParts: (productionId: number, ids: number[]) => request<TimelineDeleteEnvelope>(`/api/v1/productions/${productionId}/parts`, { method: "DELETE", body: JSON.stringify({ ids }) }).then((response) => response.data),
  moveParts: (sourceProductionId: number, ids: number[], destinationProductionId: number) => request<TimelineMoveEnvelope>(`/api/v1/productions/${sourceProductionId}/parts/move`, { method: "POST", body: JSON.stringify({ ids, destination_production_id: destinationProductionId }) }).then((response) => response.data),
  setMusic: (id: number, settings: Partial<MusicBed>) =>
    request<{ data: MusicBed }>(`/api/v1/productions/${id}/music`, { method: "PATCH", body: JSON.stringify(settings) }).then((response) => response.data),
  insertAsset: (projectId: number, assetId: number, at: number | null) =>
    postV1<{ ok?: boolean; id?: number }>(`/api/v1/productions/${projectId}/parts/assets`, {
      asset_id: assetId,
      insert_at: at,
    }),
  saveDraft: (payload: Omit<GeneratePayload, "confirmed">) => {
    if (!payload.production_id) return Promise.reject(new ApiError("Choose a Production before saving a Draft.", 400))
    const { production_id, ...draft } = payload
    return postV1<{ id: number }>(`/api/v1/productions/${production_id}/parts/drafts`, draft)
  },
  generate: async (payload: GeneratePayload) => {
    const response = await request<{ data: DurableJob<GenerateResult> }>("/api/v1/jobs/speech", {
      method: "POST",
      headers: { "Idempotency-Key": `speech-${crypto.randomUUID()}` },
      body: JSON.stringify(payload),
    })
    return waitForJob<GenerateResult>(response.data.id)
  },
  renderDraft: async (id: number, payload: GeneratePayload) => {
    const response = await request<{ data: DurableJob<GenerateResult> }>("/api/v1/jobs/speech", { method: "POST", headers: { "Idempotency-Key": `render-draft-${id}-${crypto.randomUUID()}` }, body: JSON.stringify({ ...payload, operation: "render_draft", part_id: id }) })
    return waitForJob<GenerateResult>(response.data.id)
  },
  regenerate: async (id: number, payload: GeneratePayload) => {
    const response = await request<{ data: DurableJob<GenerateResult> }>("/api/v1/jobs/speech", { method: "POST", headers: { "Idempotency-Key": `regenerate-${id}-${crypto.randomUUID()}` }, body: JSON.stringify({ ...payload, operation: "regenerate", part_id: id }) })
    return waitForJob<GenerateResult>(response.data.id)
  },
  textPass: async (kind: "shape" | "tag", payload: { text: string; production_id?: number; part_id?: number; density?: "none" | "light" | "normal" | "heavy"; engine: "audio" | "omni" | "qwen_tts"; confirmed?: boolean }) => {
    const response = await request<{ data: DurableJob<TextPassResult> }>("/api/v1/jobs/text", { method: "POST", headers: { "Idempotency-Key": `rewrite-${kind}-${crypto.randomUUID()}` }, body: JSON.stringify({ ...payload, operation: kind }) })
    return waitForJob<TextPassResult>(response.data.id)
  },
  saveTextStates: (productionId: number, id: number, states: { text: string; text_raw: string | null; text_shaped: string | null; text_tagged: string | null; text_state: string }) =>
    request<TimelineOkEnvelope>(`/api/v1/productions/${productionId}/parts/${id}/text`, { method: "PATCH", body: JSON.stringify(states) }).then((response) => response.data),
  takes: (productionId: number, id: number) => v1<Take[]>(`/api/v1/productions/${productionId}/parts/${id}/takes`).then((takes) => ({ takes })),
  promoteTake: (productionId: number, partId: number, takeId: number) => postV1<{ ok: boolean; subtitles_stale?: number }>(`/api/v1/productions/${productionId}/parts/${partId}/takes/${takeId}/promote`, {}),
  captions: (productionId: number, id: number) => v1<TranscriptSummary[]>(`/api/v1/productions/${productionId}/parts/${id}/captions`).then((transcripts) => ({ transcripts })),
  transcript: (id: number) => v1<Transcript>(`/api/v1/subtitles/${id}`),
  transcribePart: async (productionId: number, part: ProductionPart, confirmed = false) => {
    const response = await request<{ data: DurableJob<CaptionMutationResult> }>("/api/v1/jobs/transcription", {
      method: "POST",
      headers: { "Idempotency-Key": `transcribe-part-${part.id}-${crypto.randomUUID()}` },
      body: JSON.stringify({ file: part.filename, generation_id: part.id, production_id: productionId, confirmed }),
    })
    return waitForJob<CaptionMutationResult>(response.data.id)
  },
  translateTranscript: async (id: number, target: string, confirmed = false) => {
    const response = await request<{ data: DurableJob<CaptionMutationResult> }>("/api/v1/jobs/translation", {
      method: "POST",
      headers: { "Idempotency-Key": `translate-${id}-${target}-${crypto.randomUUID()}` },
      body: JSON.stringify({ transcript_id: id, target, confirmed }),
    })
    return waitForJob<CaptionMutationResult>(response.data.id)
  },
  uploadAsset: async (collectionId: number, file: File) => {
    const response = await uploadFile<{ data: UploadedAsset }>(`/api/v1/asset-collections/${collectionId}/assets/upload`, file)
    return response.data
  },
}

export function audioUrl(filename?: string) {
  return filename ? `/audio/${encodeURIComponent(filename)}` : ""
}
