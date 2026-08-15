import type { ClonedVoice, GeneratePayload, ResolvedGeneratePayload, VoiceDirectory } from "@/types/domain"

export function resolveRequestRoute(request: Pick<GeneratePayload, "binding_id" | "catalogue_voice_id">, directory: VoiceDirectory) {
  return directory.registry?.bindings.find((item) =>
    Boolean(request.binding_id && item.binding_id === request.binding_id)
    || Boolean(request.catalogue_voice_id && item.catalogue_voice_id === request.catalogue_voice_id))
}

export function resolveRequestVoice(request: ResolvedGeneratePayload, directory: VoiceDirectory) {
  const route = resolveRequestRoute(request, directory)
  const identity = directory.identities?.find((item) => item.id === request.voice_identity_id)
  return {
    name: identity?.name || route?.name || "Voice",
    providerVoiceId: request.voice || route?.provider_voice_id || "",
    engine: request.engine || route?.engine,
    model: request.model || route?.tier,
    modelId: request.model_id || route?.model_id,
  }
}

export function voiceKey(id?: string) {
  return String(id || "").replace(/^qwen[\w.-]*?-tts-(?:plus|flash)-/i, "").trim()
}

function cloneId(item: ClonedVoice) {
  return String(item.voice_id || item.voice || "")
}

function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([0-9])/gi, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

function stockFallbackName(key: string) {
  const withoutVersion = key.replace(/_v\d+(?:\.\d+)*$/i, "")
  const withoutFamily = withoutVersion.replace(/^loong/i, "").replace(/^longan/i, "")
  return humanize(withoutFamily || withoutVersion)
}

export function languageDisplay(value?: string) {
  const names: Record<string, string> = { en: "English", ar: "Arabic", zh: "Chinese", fr: "French", de: "German", es: "Spanish", id: "Indonesian" }
  return String(value || "").split(/[, ]+/).filter(Boolean).map((language) => names[language.toLowerCase()] || language).join(", ")
}

export function languageFlag(value?: string) {
  const flags: Record<string, string> = {
    en: "🇬🇧", english: "🇬🇧", ar: "🇸🇦", arabic: "🇸🇦", zh: "🇨🇳", chinese: "🇨🇳",
    fr: "🇫🇷", french: "🇫🇷", de: "🇩🇪", german: "🇩🇪", es: "🇪🇸", spanish: "🇪🇸",
    id: "🇮🇩", indonesian: "🇮🇩", ja: "🇯🇵", japanese: "🇯🇵", ko: "🇰🇷", korean: "🇰🇷",
  }
  return flags[String(value || "").trim().toLocaleLowerCase()] || "🌐"
}

export type ResolvedVoice = {
  id: string
  key: string
  name: string
  detail: string
  image?: string
  cloned: boolean
  unavailable: boolean
  preview?: string
  editorialLanguage?: string
}

export function resolveVoice(id: string | undefined, directory: VoiceDirectory, identityId?: string | null): ResolvedVoice {
  const technicalId = String(id || "")
  const key = voiceKey(technicalId)
  const identity = identityId ? directory.identities?.find((item) => item.id === identityId) : undefined
  const meta = directory.meta[key] || directory.meta[technicalId]
  const catalogue = directory.catalog.find((item) => voiceKey(item.id) === key)
  const binding = directory.registry?.bindings.find((item) =>
    item.binding_id === technicalId
    || item.catalogue_voice_id === technicalId
    || item.provider_voice_id === technicalId)
  const cloned = directory.cloned.find((item) => voiceKey(cloneId(item)) === key)
  const omniDescription = directory.config?.capabilities.omni?.system_voices?.[technicalId]
  const cloneMatch = /^qwen[\w.-]*?-tts-(?:plus|flash)-([a-z0-9_-]+)-[0-9a-f]{16,}$/i.exec(technicalId)
  const isClone = Boolean(cloned || cloneMatch || /qwen-omni-vc-/i.test(technicalId))
  const fallbackCloneName = cloneMatch?.[1] || cloned?.name || key.replace(/-[0-9a-f]{16,}$/i, "")
  const configDescription = Object.values(directory.config?.voices || {}).map((tier) => tier[technicalId] || Object.entries(tier).find(([voice]) => voiceKey(voice) === key)?.[1]).find(Boolean)
  const ownedSnapshotName = identityId
    ? /^(?:qwen|cosyvoice)[-_]/i.test(technicalId) ? "Owned voice" : humanize(technicalId)
    : ""
  const name = identity?.name || meta?.name || binding?.name || cloned?.name || catalogue?.name || ownedSnapshotName || (omniDescription ? technicalId : isClone ? `${humanize(fallbackCloneName)} · your voice` : stockFallbackName(key || "Unknown voice"))
  const editorialLanguage = identity?.metadata.editorial_language
  const identityDetail = [editorialLanguage ? `${languageFlag(String(editorialLanguage))} ${languageDisplay(String(editorialLanguage))} focus` : "", identity?.metadata.trait, identity?.metadata.accent].filter(Boolean).join(" · ")
  const detail = identity ? identityDetail || "Your cloned voice" : isClone
    ? [meta?.languages ? `Speaks ${languageDisplay(meta.languages)}` : "Cloned voice", cloned?.engine === "omni" || /omni/i.test(technicalId) ? "Qwen Omni" : "Qwen Audio"].filter(Boolean).join(" · ")
    : binding?.description || omniDescription || [catalogue?.gender, catalogue?.age, catalogue?.trait].filter(Boolean).join(", ") || configDescription || meta?.note || "Voice"
  const knownInConfig = Object.values(directory.config?.voices || {}).some((tier) => Object.keys(tier).some((voice) => voiceKey(voice) === key))
  const unavailable = Boolean(technicalId && !identity && !isClone && !binding && !catalogue && !omniDescription && !knownInConfig)
  const made = directory.usage?.[key]?.latest_preview
  const previewFilename = identity?.usage?.preview_filename
  const preview = previewFilename ? `/audio/${encodeURIComponent(previewFilename)}` : catalogue?.sample ? `/samples/${encodeURIComponent(catalogue.sample)}` : made ? `/audio/${encodeURIComponent(made)}` : undefined
  return { id: technicalId, key: identity?.id || key, name: name.trim() || "Unavailable voice", detail, image: String(identity?.metadata.image || binding?.image || meta?.image || directory.config?.voice_images?.[key] || "") || undefined, cloned: Boolean(identity || isClone), unavailable, preview, editorialLanguage: String(editorialLanguage || "") || undefined }
}
