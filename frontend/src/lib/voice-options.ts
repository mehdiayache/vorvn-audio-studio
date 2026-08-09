import type { VoiceModelSummary, VoiceRegistry } from "@/types/domain"

export type SpeechEngine = "audio" | "omni" | "qwen_tts"
export type SpeechModel = "plus" | "flash" | "vc"

export type VoiceChoice = {
  id: string
  identityId: string
  name: string
  description: string
  source: "mine" | "alibaba"
  engine: SpeechEngine
  model: SpeechModel
  modelId: string
  compatible: boolean
  languages: string[]
  status: string
}

export function languageForVoice(
  choice: VoiceChoice,
  binding: { source: string; reference?: { source_language?: string | null } | null } | undefined,
  labels: Record<string, string> = {},
  current = "Auto",
) {
  const sourceCode = binding?.source === "custom" ? binding.reference?.source_language?.trim() : ""
  const sourceLanguage = sourceCode ? labels[sourceCode] : undefined
  const supports = (language: string) => choice.languages.some((item) => item.toLocaleLowerCase() === language.toLocaleLowerCase())
  if (current === "Auto" && sourceLanguage && supports(sourceLanguage)) return sourceLanguage
  if (choice.languages.length === 1) return choice.languages[0] || "Auto"
  if (current !== "Auto" && !supports(current)) return choice.languages[0] || "Auto"
  return current
}

export function getVoiceOptions(registry: VoiceRegistry | null, engine: SpeechEngine, model: SpeechModel) {
  if (!registry) return { choices: [] as VoiceChoice[], compatible: [] as VoiceChoice[], summary: null as VoiceModelSummary | null }
  const choices = registry.bindings.map((binding): VoiceChoice => ({
    id: binding.provider_voice_id,
    identityId: binding.identity_id,
    name: binding.name,
    description: binding.description,
    source: binding.source === "custom" ? "mine" : "alibaba",
    engine: binding.engine,
    model: binding.tier,
    modelId: binding.model_id,
    compatible: binding.engine === engine && binding.tier === model && !["undeployed", "deleted"].includes(binding.status.toLocaleLowerCase()),
    languages: binding.languages,
    status: binding.status,
  }))
  const summary = registry.models.find((item) => item.engine === engine && item.tier === model) || null
  return { choices, compatible: choices.filter((choice) => choice.compatible), summary }
}
