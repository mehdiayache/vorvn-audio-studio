import { durableOperationTruth } from "@/lib/operation-language"
import { resolveSpeechModel } from "@/components/speech-model-identity"
import { formatMoney, partDurationMs } from "@/lib/format"
import { resolveVoice, type ResolvedVoice } from "@/lib/voice"
import type { DurableJob, GenerateResult, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

export type SpeechPartAlert = {
  key: "draft" | "outdated" | "missing" | "fidelity" | "route"
  label: string
  tone: "neutral" | "warning" | "danger"
}

export type SpeechPartOperationFact = {
  kind: "idle" | "active" | "confirmation" | "review" | "failed" | "ready"
  label: string
  detail: string
  progress: number | null
  canRetry: boolean
  canConfirm: boolean
  canReviewTake: boolean
}

export type SpeechPartCardFacts = {
  recorded: boolean
  playable: boolean
  voice: ResolvedVoice
  selectedVoiceName: string
  castName: string | null
  castColor: string | null
  directVoice: boolean
  futureVoiceName: string | null
  methodLine: string
  exactModel: string
  technicalDetail: string
  script: string
  takeSummary: string
  durationLabel: string
  selectedTakeLabel: string
  takeCountLabel: string
  inputLabel: "Original" | "Spoken" | "Tagged" | null
  totalTakes: number
  captionSummary: string
  captionTone: "neutral" | "ready" | "active" | "warning" | "danger"
  spendSummary: string
  spendValue: string
  alerts: SpeechPartAlert[]
  operation: SpeechPartOperationFact
}

const FAMILY_LABELS: Record<string, string> = {
  audio: "Qwen Audio",
  omni: "Qwen Omni",
  qwen_tts: "Qwen3 TTS",
}

const LANGUAGE_CODES: Record<string, string> = {
  arabic: "AR", chinese: "ZH", czech: "CS", danish: "DA", dutch: "NL",
  english: "EN", finnish: "FI", french: "FR", german: "DE", hebrew: "HE",
  hindi: "HI", icelandic: "IS", indonesian: "ID", italian: "IT", japanese: "JA",
  korean: "KO", malay: "MS", norwegian: "NO", persian: "FA", polish: "PL",
  portuguese: "PT", russian: "RU", spanish: "ES", swedish: "SV", tagalog: "TL",
  thai: "TH", turkish: "TR", urdu: "UR", vietnamese: "VI",
}

export function selectedTakeInputLabel(state?: string | null): SpeechPartCardFacts["inputLabel"] {
  if (state === "raw") return "Original"
  if (state === "shaped") return "Spoken"
  if (state === "tagged") return "Tagged"
  return null
}

function compactDuration(durationMs: number) {
  if (!durationMs) return "0:00"
  const totalTenths = Math.round(durationMs / 100)
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`
}

function humanize(value?: string | null) {
  return String(value || "")
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

function languageCode(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized || normalized === "auto") return ""
  if (/^[a-z]{2,3}$/.test(normalized)) return normalized.toUpperCase()
  return LANGUAGE_CODES[normalized] || normalized.slice(0, 2).toUpperCase()
}

function selectedCapability(part: ProductionPart, directory: VoiceDirectory) {
  if (part.capability_name) return part.capability_name
  const configured = part.engine ? directory.config?.capabilities?.[part.engine] : null
  return configured?.operator_title || configured?.label || humanize(part.capability_id)
}

function currentCastVoice(castRole: ProductionCastRole | undefined, directory: VoiceDirectory) {
  if (!castRole) return null
  if (castRole.voice_source_kind === "identity" && castRole.voice_identity_id) {
    return resolveVoice(undefined, directory, castRole.voice_identity_id)
  }
  if (castRole.catalogue_voice_id) return resolveVoice(castRole.catalogue_voice_id, directory)
  return null
}

function futureVoice(part: ProductionPart, castRole: ProductionCastRole | undefined, selected: ResolvedVoice, directory: VoiceDirectory) {
  const current = currentCastVoice(castRole, directory)
  if (!current || !part.selected_take_id) return null
  const sameIdentity = Boolean(part.voice_identity_id && castRole?.voice_identity_id === part.voice_identity_id)
  const sameCatalogue = Boolean(part.catalogue_voice_id && castRole?.catalogue_voice_id === part.catalogue_voice_id)
  if (sameIdentity || sameCatalogue || current.name === selected.name) return null
  return current.name
}

function captionFacts(part: ProductionPart, job: DurableJob<unknown> | null) {
  if (job) {
    const truth = durableOperationTruth(job)
    if (truth.active) return { summary: "CC Creating…", tone: "active" as const }
    if (truth.failed) return { summary: "CC Failed", tone: "danger" as const }
    if (truth.review || truth.confirmation) return { summary: `CC ${truth.label}`, tone: "warning" as const }
  }
  if (!part.subtitled) return { summary: "CC —", tone: "neutral" as const }
  const languages = [part.caption_source_language, ...(part.languages || [])]
    .map(languageCode).filter(Boolean)
  const summary = languages.length ? `CC ${Array.from(new Set(languages)).join(" + ")}` : "CC Ready"
  return {
    summary: `${summary}${part.subtitles_stale ? " stale" : ""}`,
    tone: part.subtitles_stale ? "warning" as const : "ready" as const,
  }
}

function operationFacts(part: ProductionPart, job: (DurableJob<GenerateResult> & { request?: { select_result?: boolean } }) | null, totalTakes: number): SpeechPartOperationFact {
  const idle: SpeechPartOperationFact = { kind: "idle", label: "", detail: "", progress: null, canRetry: false, canConfirm: false, canReviewTake: false }
  if (!job) return idle
  const truth = durableOperationTruth(job as DurableJob<unknown>)
  const requestedAlternative = job.request?.select_result === false
  const returnedAlternative = requestedAlternative && Boolean(job.result?.take_id) && job.result.take_id !== part.selected_take_id
  const takeNumber = Math.max(1, totalTakes)
  if (["ok", "warning"].includes(job.status)) {
    return returnedAlternative
      ? { ...idle, kind: "ready", label: `TAKE ${takeNumber} READY`, detail: "A new alternative is available. The selected Take did not change.", canReviewTake: true }
      : idle
  }
  if (truth.confirmation) return { ...idle, kind: "confirmation", label: `TAKE ${takeNumber} · WAITING FOR CONFIRMATION`, detail: truth.detail, canConfirm: true }
  if (truth.review) return { ...idle, kind: "review", label: `TAKE ${takeNumber} · REVIEW REQUIRED`, detail: truth.detail }
  if (truth.failed) return { ...idle, kind: "failed", label: `TAKE ${takeNumber} · ${truth.label.toUpperCase()}`, detail: truth.detail, canRetry: job.status !== "cancelled" }
  if (truth.active) {
    const progress = Math.max(0, Math.min(100, Math.round(Number(job.progress || 0))))
    const state = job.status === "queued" ? "QUEUED" : job.status === "retrying" ? "RETRYING" : `GENERATING ${progress}%`
    return { ...idle, kind: "active", label: `TAKE ${takeNumber} · ${state}`, detail: truth.detail, progress }
  }
  return idle
}

export function speechPartCardFacts({ part, speechJob, captionJob, directory, castRole }: {
  part: ProductionPart
  speechJob: (DurableJob<GenerateResult> & { request?: { select_result?: boolean } }) | null
  captionJob?: DurableJob<unknown> | null
  directory: VoiceDirectory
  castRole?: ProductionCastRole
}): SpeechPartCardFacts {
  const recorded = Boolean(part.selected_take_id)
  const displayVoice = part.voice_name || part.voice
  const voice = resolveVoice(displayVoice, directory, part.voice_identity_id)
  const model = resolveSpeechModel({ engine: part.engine, tier: part.tier, model: part.model, config: directory.config })
  const capability = selectedCapability(part, directory)
  const family = FAMILY_LABELS[String(model.engine || "")] || model.product
  const methodLine = [family, model.tierName, capability, languageCode(part.language)].filter(Boolean).join(" · ")
  const technicalDetail = [model.modelId, part.provider, part.provider_region, part.language ? `Language: ${part.language}` : ""].filter(Boolean).join(" · ")
  const alternatives = Math.max(0, Number(part.takes || 0))
  const totalTakes = alternatives + (recorded ? 1 : 0)
  const inputLabel = selectedTakeInputLabel(part.selected_take_text_state)
  const duration = partDurationMs(part)
  const durationLabel = compactDuration(duration)
  const selectedTakeLabel = recorded
    ? [`Take ${part.selected_take_number || "—"}`, inputLabel || "Unknown input"].join(" · ")
    : "Not recorded"
  const takeCountLabel = `${totalTakes} ${totalTakes === 1 ? "Take" : "Takes"}`
  const takeSummary = recorded
    ? [`Take ${part.selected_take_number || "—"} selected`, durationLabel, takeCountLabel, inputLabel ? `${inputLabel} input` : "Input unknown"].join(" · ")
    : "Not recorded · 0:00"
  const captions = captionFacts(part, captionJob || null)
  const alerts: SpeechPartAlert[] = []
  if (!recorded) alerts.push({ key: "draft", label: "Not recorded", tone: "neutral" })
  if (part.outdated) alerts.push({ key: "outdated", label: "Take outdated", tone: "warning" })
  if (part.missing) alerts.push({ key: "missing", label: "Missing audio", tone: "danger" })
  if (part.fidelity && part.fidelity.status !== "pass") alerts.push({ key: "fidelity", label: "Check wording", tone: "warning" })
  if (part.binding_resolution_status === "unresolved") alerts.push({ key: "route", label: "Historical route unavailable", tone: "warning" })
  const currentFutureVoice = futureVoice(part, castRole, voice, directory)
  return {
    recorded,
    playable: recorded && Boolean(part.filename) && !part.missing,
    voice,
    selectedVoiceName: voice.name,
    castName: part.cast_role_name || castRole?.name || null,
    castColor: castRole?.color || null,
    directVoice: !part.cast_role_id,
    futureVoiceName: currentFutureVoice,
    methodLine: methodLine || "Recording method unknown",
    exactModel: model.modelId,
    technicalDetail,
    script: part.text || "Untitled speech",
    takeSummary,
    durationLabel,
    selectedTakeLabel,
    takeCountLabel,
    inputLabel,
    totalTakes,
    captionSummary: captions.summary,
    captionTone: captions.tone,
    spendSummary: Number(part.spent || 0) > 0 ? `${formatMoney(Number(part.spent))} spent` : "No generation spend",
    spendValue: Number(part.spent || 0) > 0 ? formatMoney(Number(part.spent)) : "—",
    alerts,
    operation: operationFacts(part, speechJob, totalTakes + (speechJob && !["ok", "warning"].includes(speechJob.status) ? 1 : 0)),
  }
}
