import type { ProductionPart, ResolvedGeneratePayload } from "@/types/domain"
import type { StudioConfig } from "@/types/domain"
import { SpeechModelIdentity, speechProductName, speechTierName } from "@/components/speech-model-identity"

type SpeechRoute = Pick<ResolvedGeneratePayload, "engine" | "model" | "language"> | Pick<ProductionPart, "engine" | "model" | "language">

export function speechEngineLabel(engine?: string | null) {
  return engine ? speechProductName(engine) : "Speech"
}

export function speechModelLabel(model?: string | null) {
  return speechTierName(model)
}

export function SpeechRouteLabel({ route, includeLanguage = false, config = null }: { route: SpeechRoute; includeLanguage?: boolean; config?: StudioConfig | null }) {
  return <span className="speech-route-label"><SpeechModelIdentity engine={route.engine} tier={route.model} config={config} compact />{includeLanguage && route.language && <em>{route.language}</em>}</span>
}
