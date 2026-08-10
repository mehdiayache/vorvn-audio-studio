import type { SpeechEngine, VoiceChoice, VoiceIdentityChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"

export type VoiceLanguageStatus = "documented" | "unavailable" | "undetermined"

function sameLanguage(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()
}

export function voiceLanguageStatus(
  route: VoiceChoice,
  language: string,
  _customVoice: boolean,
): VoiceLanguageStatus {
  if (!language || language === "Auto") return "undetermined"
  if (route.languages.some((item) => sameLanguage(item, language))) return "documented"
  return "unavailable"
}

export function capabilityTitle(engine: SpeechEngine, config?: StudioConfig | null) {
  return config?.capabilities[engine]?.operator_title
    || (engine === "audio" ? "Expressive speech + tags" : engine === "omni" ? "Natural performance" : "Exact long reading")
}

export function officialCoverageLabel(route: VoiceChoice) {
  if (!route.languages.length) return "No published language list"
  return `${route.languages.length} documented language${route.languages.length === 1 ? "" : "s"}`
}

export function outputLanguageOptions(
  config: StudioConfig | null,
  identity?: VoiceIdentityChoice,
) {
  return [...new Set([
    "Auto",
    ...(config?.languages || []),
    ...(identity?.routes.flatMap((route) => route.languages) || []),
  ])]
}
