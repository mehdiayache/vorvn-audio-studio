import type { VoiceCapabilityChoice, VoiceChoice } from "@/lib/voice-options"

export type CreatorCapabilityControls = {
  deliveryTags: boolean
  naturalDirection: boolean
  directionModes: string[]
  rate: boolean
  pitch: boolean
  volume: boolean
  seed: boolean
  ssml: boolean
  wordTimestamps: boolean
  languageHints: boolean
  verifiedPassages: boolean
  directionLabel: string
  exactHelp: string
  directedHelp: string
  outputNote: string
}

function boolean(value: unknown) {
  return value === true
}

export function selectedRouteCapability(
  route: VoiceChoice | null | undefined,
  capabilityId: string | null | undefined,
): VoiceCapabilityChoice | null {
  if (!route) return null
  if (capabilityId) return route.capabilities.find((item) => item.id === capabilityId) || null
  return route.capabilities.length === 1 ? route.capabilities[0] || null : null
}

export function creatorCapabilityControls(
  capability: VoiceCapabilityChoice | null,
): CreatorCapabilityControls {
  const controls = capability?.controls || {}
  const metadata = capability?.uiMetadata || {}
  const directionModes = Array.isArray(controls.direction_modes)
    ? controls.direction_modes.filter((item): item is string => typeof item === "string")
    : []
  return {
    deliveryTags: boolean(controls.delivery_tags),
    naturalDirection: boolean(controls.natural_direction),
    directionModes,
    rate: boolean(controls.rate),
    pitch: boolean(controls.pitch),
    volume: boolean(controls.volume),
    seed: boolean(controls.seed),
    ssml: boolean(controls.ssml),
    wordTimestamps: boolean(controls.word_timestamps),
    languageHints: boolean(controls.language_hints),
    verifiedPassages: boolean(controls.verified_passages),
    directionLabel: String(metadata.direction_label || "Performance direction"),
    exactHelp: String(metadata.exact_help || "Read the prepared script without an added performance direction."),
    directedHelp: String(metadata.directed_help || "Use one overall natural-language performance direction."),
    outputNote: String(metadata.output_note || ""),
  }
}

export function resolvedDeliveryMode(controls: CreatorCapabilityControls, requested: string) {
  if (controls.directionModes.includes(requested)) return requested
  if (controls.directionModes.length === 1) return controls.directionModes[0]!
  return null
}
