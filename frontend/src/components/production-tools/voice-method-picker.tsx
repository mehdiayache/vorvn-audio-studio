import { Check, ChevronDown, Circle, CircleAlert, CircleDot, LockKeyhole } from "lucide-react"

import { resolveSpeechModel } from "@/components/speech-model-identity"
import { capabilityTitle, officialCoverageLabel, voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { SpeechEngine, VoiceChoice } from "@/lib/voice-options"
import { cn } from "@/lib/utils"
import type { StudioConfig } from "@/types/domain"

const order: SpeechEngine[] = ["audio", "qwen_tts", "omni"]

export function VoiceMethodPicker({ routes, availableRoutes, selectedRouteId, language, customVoice, compact = false, config, onSelect }: {
  routes: VoiceChoice[]
  availableRoutes: VoiceChoice[]
  selectedRouteId: string
  language: string
  customVoice: boolean
  compact?: boolean
  config: StudioConfig | null
  onSelect: (route: VoiceChoice) => void
}) {
  const orderedRoutes = [...routes].sort((left, right) => {
    const engineOrder = order.indexOf(left.engine) - order.indexOf(right.engine)
    return engineOrder || left.modelId.localeCompare(right.modelId)
  })
  const selectedRoute = routes.find((route) => route.id === selectedRouteId)
  const selectedRoutes = selectedRoute ? [selectedRoute] : []
  const selectedInfo = selectedRoute ? config?.capabilities[selectedRoute.engine] : undefined
  const selectedNotes = selectedInfo?.operator_notes || []

  return <div className={cn("capability-picker", compact && "compact")}>
    <div className="capability-choice-list" aria-label="Voice capabilities">
      {orderedRoutes.map((route) => {
        const engine = route.engine
        const info = config?.capabilities[engine]
        const available = availableRoutes.some((item) => item.id === route.id)
        const languageStatus = route
          ? voiceLanguageStatus(route, language, customVoice)
          : "unavailable"
        const selected = selectedRouteId === route.id
        const resolvedModel = resolveSpeechModel({ engine: route.engine,
          tier: route.model, modelId: route.modelId, config })
        const modelLabel = `${resolvedModel.product}${resolvedModel.tierName ? ` · ${resolvedModel.tierName}` : ""}`

        return <button
          type="button"
          key={route.id}
          className={cn("capability-choice-row", selected && "selected", !available && "unavailable")}
          disabled={!available}
          aria-pressed={selected}
          onClick={() => onSelect(route)}
        >
          <span className="capability-row-radio" aria-hidden="true">{selected ? <CircleDot /> : <Circle />}</span>
          <span className="capability-row-copy">
            <span className="capability-card-title">{capabilityTitle(engine, config)}</span>
            <b>{info?.purpose || "Speech recording"}</b>
          </span>
          <span className="capability-row-model">{modelLabel}</span>
          <small className={cn("capability-card-state", languageStatus)}>{available
            ? languageStatus === "documented"
              ? <><Check /> Supports {language}</>
              : languageStatus === "unavailable"
                ? <><CircleAlert /> Not documented for {language}</>
                : <><Check /> Ready</>
            : <><LockKeyhole /> Model does not document {language}</>}</small>
          {route && <small className="capability-card-coverage">{officialCoverageLabel(route)}</small>}
        </button>
      })}
    </div>
    {!compact && selectedRoutes.length > 0 && <details className="capability-choice-details">
      <summary><ChevronDown /><b>Details</b><span>Model behavior, tags, and limits</span></summary>
      <div>
        {selectedNotes.length > 0 && <ul>{selectedNotes.map((note) => <li key={note}>{note}</li>)}</ul>}
        <div className="capability-detail-models">{selectedRoutes.map((route) => {
          const model = resolveSpeechModel({ engine: route.engine, tier: route.model, modelId: route.modelId, config })
          return <span key={route.modelId}><b>{model.product}{model.tierName ? ` · ${model.tierName}` : ""}</b><code>{model.modelId}</code></span>
        })}</div>
      </div>
    </details>}
  </div>
}
