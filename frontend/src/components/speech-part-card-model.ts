import { durableOperationTruth } from "@/lib/operation-language"
import { resolveSpeechModel } from "@/components/speech-model-identity"
import { formatMoney, partDurationMs } from "@/lib/format"
import { resolveRequestRoute, resolveVoice, type ResolvedVoice } from "@/lib/voice"
import type { DurableJob, GenerateResult, ProjectPart, VoiceDirectory } from "@/types/domain"

export type SpeechPartAlert = {
  key: "draft" | "outdated" | "missing" | "route"
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
}

export type SpeechPartCardFacts = {
  recorded: boolean
  playable: boolean
  voice: ResolvedVoice
  selectedVoiceName: string
  methodLine: string
  exactModel: string
  technicalDetail: string
  script: string
  scriptState: "raw" | "shaped" | "tagged" | null
  recordingSummary: string
  durationLabel: string
  inputLabel: "Original" | "Spoken" | "Tagged" | null
  captionSummary: string
  captionTone: "neutral" | "ready" | "active" | "warning" | "danger"
  spendSummary: string
  spendValue: string
  alerts: SpeechPartAlert[]
  operation: SpeechPartOperationFact
}

const FAMILY_LABELS: Record<string, string> = {
  audio: "Qwen Audio",
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

export function recordingInputLabel(state?: string | null): SpeechPartCardFacts["inputLabel"] {
  if (state === "raw") return "Original"
  if (state === "shaped") return "Spoken"
  if (state === "tagged") return "Tagged"
  return null
}

function recordingTextState(state?: string | null): SpeechPartCardFacts["scriptState"] {
  return state === "raw" || state === "shaped" || state === "tagged"
    ? state
    : null
}

function displayedScript(part: ProjectPart, recorded: boolean) {
  const state = recordingTextState(recorded
    ? part.recording_text_state
    : part.text_state)
  if (!recorded) return { text: part.text || "Untitled speech", state }
  if (state === "raw") {
    return { text: part.clip_raw_text || part.text_raw || part.text || "Untitled speech", state }
  }
  if (state === "shaped") {
    return { text: part.clip_spoken_text || part.text_shaped || part.text || "Untitled speech", state }
  }
  if (state === "tagged") {
    return { text: part.clip_tagged_text || part.text_tagged || part.text || "Untitled speech", state }
  }
  return { text: part.text || "Untitled speech", state: null }
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

function selectedCapability(part: ProjectPart, directory: VoiceDirectory) {
  if (part.capability_name) return part.capability_name
  const route = resolveRequestRoute({ binding_id: part.binding_id || null, catalogue_voice_id: part.catalogue_voice_id || null }, directory)
  const routeCapability = (route?.capabilities || []).find((item) => item.id === part.capability_id)
  if (routeCapability?.name) return routeCapability.name
  const configured = part.engine ? directory.config?.capabilities?.[part.engine] : null
  return configured?.operator_title || configured?.label || humanize(part.capability_id)
}

function captionFacts(part: ProjectPart, job: DurableJob<unknown> | null) {
  if (job) {
    const truth = durableOperationTruth(job)
    if (truth.active) return { summary: "Creating captions…", tone: "active" as const }
    if (truth.failed) return { summary: "Captions failed", tone: "danger" as const }
    if (truth.review || truth.confirmation) return { summary: `Captions · ${truth.label}`, tone: "warning" as const }
  }
  if (!part.subtitled) return { summary: "No captions", tone: "neutral" as const }
  const languages = [part.caption_source_language, ...(part.languages || [])]
    .map(languageCode).filter(Boolean)
  const summary = languages.length ? `${Array.from(new Set(languages)).join(" + ")} captions` : "Captions ready"
  return {
    summary: `${summary}${part.subtitles_stale ? " need review" : ""}`,
    tone: part.subtitles_stale ? "warning" as const : "ready" as const,
  }
}

function operationFacts(job: DurableJob<GenerateResult> | null): SpeechPartOperationFact {
  const idle: SpeechPartOperationFact = { kind: "idle", label: "", detail: "", progress: null, canRetry: false, canConfirm: false }
  if (!job) return idle
  const truth = durableOperationTruth(job as DurableJob<unknown>)
  if (["ok", "warning"].includes(job.status)) return idle
  if (truth.confirmation) return { ...idle, kind: "confirmation", label: "RECORDING · WAITING FOR CONFIRMATION", detail: truth.detail, canConfirm: true }
  if (truth.review) return { ...idle, kind: "review", label: "RECORDING · REVIEW REQUIRED", detail: truth.detail }
  if (truth.failed) return { ...idle, kind: "failed", label: `RECORDING · ${truth.label.toUpperCase()}`, detail: truth.detail, canRetry: job.status !== "cancelled" }
  if (truth.active) {
    const progress = Math.max(0, Math.min(100, Math.round(Number(job.progress || 0))))
    const state = job.status === "queued" ? "QUEUED" : job.status === "retrying" ? "RETRYING" : `GENERATING ${progress}%`
    return { ...idle, kind: "active", label: `RECORDING · ${state}`, detail: truth.detail, progress }
  }
  return idle
}

export function speechPartCardFacts({ part, speechJob, captionJob, directory }: {
  part: ProjectPart
  speechJob: DurableJob<GenerateResult> | null
  captionJob?: DurableJob<unknown> | null
  directory: VoiceDirectory
}): SpeechPartCardFacts {
  const recorded = Boolean(part.clip_id)
  const script = displayedScript(part, recorded)
  const route = resolveRequestRoute({ binding_id: part.binding_id || null, catalogue_voice_id: part.catalogue_voice_id || null }, directory)
  const displayVoice = part.catalogue_voice_id || part.voice || part.voice_name
  const voice = resolveVoice(displayVoice, directory, part.voice_identity_id)
  const model = resolveSpeechModel({ provider: part.provider || route?.provider, engine: part.engine || route?.engine, tier: part.tier || route?.tier, model: part.model || route?.model_id, config: directory.config })
  const capability = selectedCapability(part, directory)
  const family = FAMILY_LABELS[String(model.engine || "")] || model.product
  const hasRecordingMethod = Boolean(route || part.engine || part.model || part.tier || part.provider || part.binding_id || part.capability_id)
  const methodLine = hasRecordingMethod
    ? [family, model.tierName, capability, languageCode(part.language)].filter(Boolean).join(" · ")
    : ["Recording method not chosen", languageCode(part.language)].filter(Boolean).join(" · ")
  const technicalDetail = [model.modelId, part.provider, part.provider_region, part.language ? `Language: ${part.language}` : ""].filter(Boolean).join(" · ")
  const inputLabel = recordingInputLabel(part.recording_text_state)
  const duration = partDurationMs(part)
  const durationLabel = compactDuration(duration)
  const recordingSummary = recorded
    ? ["Active recording", durationLabel, inputLabel ? `${inputLabel} input` : "Input unknown"].join(" · ")
    : "Not recorded · 0:00"
  const captions = captionFacts(part, captionJob || null)
  const alerts: SpeechPartAlert[] = []
  if (!recorded) alerts.push({ key: "draft", label: "Not recorded", tone: "neutral" })
  if (part.outdated) alerts.push({ key: "outdated", label: "Recording outdated", tone: "warning" })
  if (part.missing) alerts.push({ key: "missing", label: "Missing audio", tone: "danger" })
  if (part.binding_resolution_status === "unresolved") alerts.push({ key: "route", label: "Historical route unavailable", tone: "warning" })
  return {
    recorded,
    playable: recorded && Boolean(part.filename) && !part.missing,
    voice,
    selectedVoiceName: voice.name,
    methodLine: methodLine || "Recording method unknown",
    exactModel: hasRecordingMethod ? model.modelId : "",
    technicalDetail,
    script: script.text,
    scriptState: script.state,
    recordingSummary,
    durationLabel,
    inputLabel,
    captionSummary: captions.summary,
    captionTone: captions.tone,
    spendSummary: Number(part.spent || 0) > 0 ? `${formatMoney(Number(part.spent))} spent` : "No generation spend",
    spendValue: Number(part.spent || 0) > 0 ? formatMoney(Number(part.spent)) : "—",
    alerts,
    operation: operationFacts(speechJob),
  }
}
