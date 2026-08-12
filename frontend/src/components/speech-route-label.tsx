import type { StudioConfig } from "@/types/domain"
import { SpeechModelIdentity, speechProductName, speechTierName } from "@/components/speech-model-identity"

type SpeechRoute = {
  engine?: string | null
  model?: string | null
  model_id?: string | null
  tier?: string | null
  language?: string | null
}

export function speechEngineLabel(engine?: string | null) {
  return engine ? speechProductName(engine) : "Speech"
}

export function speechModelLabel(model?: string | null) {
  return speechTierName(model)
}

export function SpeechRouteLabel({ route, includeLanguage = false, config = null }: { route: SpeechRoute; includeLanguage?: boolean; config?: StudioConfig | null }) {
  const exactModel = route.model_id || (route.tier ? route.model : null)
  const tier = route.tier || (route.model_id ? route.model : null)
  return <span className="speech-route-label"><SpeechModelIdentity engine={route.engine} tier={tier} modelId={exactModel} config={config} compact />{includeLanguage && route.language && <em>{route.language}</em>}</span>
}
