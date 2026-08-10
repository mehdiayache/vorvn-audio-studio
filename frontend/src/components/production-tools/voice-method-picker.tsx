import { Check, LockKeyhole } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SpeechEngine, VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"

const order: SpeechEngine[] = ["audio", "qwen_tts", "omni"]

export function VoiceMethodPicker({ routes, availableRoutes, selectedEngine, language, customVoice, config, onSelect }: {
  routes: VoiceChoice[]
  availableRoutes: VoiceChoice[]
  selectedEngine: SpeechEngine
  language: string
  customVoice: boolean
  config: StudioConfig | null
  onSelect: (engine: SpeechEngine) => void
}) {
  const engines = order.filter((engine) => routes.some((route) => route.engine === engine))
  return <div className="capability-choice-grid" aria-label="Recording methods">
    {engines.map((engine) => {
      const info = config?.capabilities[engine]
      const available = availableRoutes.some((route) => route.engine === engine)
      const selected = selectedEngine === engine
      return <button
        type="button"
        key={engine}
        className={cn(selected && "selected", !available && "unavailable")}
        disabled={!available}
        aria-pressed={selected}
        onClick={() => onSelect(engine)}
      >
        <span className="capability-card-title">{info?.operator_title || info?.label || engine}</span>
        <b>{info?.purpose || "Speech recording"}</b>
        <ul>{(info?.operator_notes || []).map((note) => <li key={note}>{note}</li>)}</ul>
        <small className="capability-card-state">{available
          ? <><Check /> {customVoice ? "Ready with this cloned voice" : `Ready for ${language === "Auto" ? "automatic language" : language}`}</>
          : <><LockKeyhole /> Not available in {language}</>}</small>
      </button>
    })}
  </div>
}
