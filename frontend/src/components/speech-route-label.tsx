import type { GeneratePayload, ProductionPart } from "@/types/domain"

type SpeechRoute = Pick<GeneratePayload, "engine" | "model" | "language"> | Pick<ProductionPart, "engine" | "model" | "language">

export function speechEngineLabel(engine?: string | null) {
  if (engine === "audio") return "Qwen Audio"
  if (engine === "omni") return "Qwen Omni"
  if (engine === "qwen_tts") return "Qwen3 TTS"
  return engine || "Speech"
}

export function speechModelLabel(model?: string | null) {
  if (model === "plus") return "Plus"
  if (model === "flash") return "Flash"
  if (model === "vc") return "Voice Clone"
  return model || ""
}

export function SpeechRouteLabel({ route, includeLanguage = false }: { route: SpeechRoute; includeLanguage?: boolean }) {
  const parts = [speechEngineLabel(route.engine), speechModelLabel(route.model)]
  if (includeLanguage && route.language) parts.push(route.language)
  return <span className="speech-route-label">{parts.filter(Boolean).join(" · ")}</span>
}
