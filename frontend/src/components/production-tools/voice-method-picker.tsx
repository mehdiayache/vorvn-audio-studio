import { Check, ChevronDown, Circle, CircleAlert, CircleDot, LockKeyhole } from "lucide-react"

import { resolveSpeechModel } from "@/components/speech-model-identity"
import { officialCoverageLabel, voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { VoiceChoice } from "@/lib/voice-options"
import { cn } from "@/lib/utils"
import type { StudioConfig } from "@/types/domain"

export function VoiceMethodPicker({ routes, availableRoutes, selectedRouteId, selectedCapabilityId = null, language, customVoice, compact = false, config, onSelect }: {
  routes: VoiceChoice[]
  availableRoutes: VoiceChoice[]
  selectedRouteId: string
  selectedCapabilityId?: string | null
  language: string
  customVoice: boolean
  compact?: boolean
  config: StudioConfig | null
  onSelect: (route: VoiceChoice, capabilityId?: string | null) => void
}) {
  const orderedRoutes = [...routes].sort((left, right) => {
    return left.modelId.localeCompare(right.modelId) || left.model.localeCompare(right.model)
  })
  const selectedRoute = routes.find((route) => route.id === selectedRouteId)
  const selectedRoutes = selectedRoute ? [selectedRoute] : []
  const selectedCapability = selectedRoute?.capabilities.find((item) => item.id === selectedCapabilityId)
    || (selectedRoute?.capabilities.length === 1 ? selectedRoute.capabilities[0] : null)

  return <div className={cn("capability-picker", compact && "compact")}>
    <div className="capability-choice-list" aria-label="Voice capabilities">
      {orderedRoutes.flatMap((route) => {
        const modes = route.capabilities.length > 1 ? route.capabilities : [route.capabilities[0] || null]
        return modes.map((mode) => {
          const available = availableRoutes.some((item) => item.id === route.id)
          const languageStatus = route
            ? voiceLanguageStatus(route, language, customVoice)
            : "unavailable"
          const modeId = route.capabilities.length > 1 ? mode?.id || null : null
          const selected = selectedRouteId === route.id && selectedCapabilityId === modeId
          const resolvedModel = resolveSpeechModel({ engine: route.engine,
            tier: route.model, modelId: route.modelId, config })
          const modelLabel = `${resolvedModel.product}${resolvedModel.tierName ? ` · ${resolvedModel.tierName}` : ""}`

          return <button
            type="button"
            key={`${route.id}:${modeId || "default"}`}
            className={cn("capability-choice-row", selected && "selected", !available && "unavailable")}
            disabled={!available}
            aria-pressed={selected}
            onClick={() => onSelect(route, modeId)}
          >
            <span className="capability-row-radio" aria-hidden="true">{selected ? <CircleDot /> : <Circle />}</span>
            <span className="capability-row-copy">
              <span className="capability-card-title">{mode?.name || "Recording capability"}</span>
              <b>{mode?.description || "Speech recording"}</b>
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
        })
      })}
    </div>
    {!compact && selectedRoutes.length > 0 && <details className="capability-choice-details">
      <summary><ChevronDown /><b>Details</b><span>Model behavior, tags, and limits</span></summary>
      <div>
        {selectedCapability?.description && <p>{selectedCapability.description}</p>}
        <div className="capability-detail-models">{selectedRoutes.map((route) => {
          const model = resolveSpeechModel({ engine: route.engine, tier: route.model, modelId: route.modelId, config })
          return <span key={route.modelId}><b>{model.product}{model.tierName ? ` · ${model.tierName}` : ""}</b><code>{model.modelId}</code></span>
        })}</div>
      </div>
    </details>}
  </div>
}
