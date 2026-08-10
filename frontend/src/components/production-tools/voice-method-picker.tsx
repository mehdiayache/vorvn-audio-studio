import { Check, CircleAlert, LockKeyhole } from "lucide-react"

import { cn } from "@/lib/utils"
import { capabilityTitle, officialCoverageLabel, voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { SpeechEngine, VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"

const order: SpeechEngine[] = ["audio", "qwen_tts", "omni"]

export function VoiceMethodPicker({ routes, availableRoutes, selectedEngine, language, customVoice, compact = false, config, onSelect }: {
  routes: VoiceChoice[]
  availableRoutes: VoiceChoice[]
  selectedEngine: SpeechEngine
  language: string
  customVoice: boolean
  compact?: boolean
  config: StudioConfig | null
  onSelect: (engine: SpeechEngine) => void
}) {
  const engines = order.filter((engine) => routes.some((route) => route.engine === engine))
  return <div className={cn("capability-choice-grid", compact && "compact")} aria-label="Recording methods">
    {engines.map((engine) => {
      const info = config?.capabilities[engine]
      const available = availableRoutes.some((route) => route.engine === engine)
      const route = routes.find((item) => item.engine === engine)
      const languageStatus = route
        ? voiceLanguageStatus(route, language, customVoice)
        : "unavailable"
      const selected = selectedEngine === engine
      return <button
        type="button"
        key={engine}
        className={cn(selected && "selected", !available && "unavailable")}
        disabled={!available}
        aria-pressed={selected}
        onClick={() => onSelect(engine)}
      >
        <span className="capability-card-title">{capabilityTitle(engine, config)}</span>
        <b>{info?.purpose || "Speech recording"}</b>
        <ul>{(info?.operator_notes || []).map((note) => <li key={note}>{note}</li>)}</ul>
        {route && <small className="capability-card-coverage">{officialCoverageLabel(route)}</small>}
        <small className={cn("capability-card-state", languageStatus)}>{available
          ? languageStatus === "documented"
            ? <><Check /> Officially supports {language}</>
            : languageStatus === "experimental"
              ? <><CircleAlert /> Experimental for {language}</>
              : <><Check /> Ready with this {customVoice ? "cloned voice" : "Alibaba voice"}</>
          : <><LockKeyhole /> Not available in {language}</>}</small>
      </button>
    })}
  </div>
}
