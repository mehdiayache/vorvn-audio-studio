import { CheckCircle2, CircleAlert, Languages } from "lucide-react"

import { officialCoverageLabel, voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { VoiceChoice } from "@/lib/voice-options"

import "./voice-language-support.css"

export function VoiceLanguageSupport({ route, language, customVoice, compact = false }: {
  route?: VoiceChoice
  language: string
  customVoice: boolean
  compact?: boolean
}) {
  if (!route) return null
  const status = voiceLanguageStatus(route, language, customVoice)
  const explicitLanguage = language && language !== "Auto"
  return <section className={`voice-language-support ${status}${compact ? " compact" : ""}`} aria-live="polite">
    <div className="voice-language-verdict">
      <span>{status === "documented" ? <CheckCircle2 /> : status === "unavailable" ? <CircleAlert /> : <Languages />}</span>
      <div>
        <b>{status === "documented"
          ? `${language} is officially supported`
          : status === "unavailable"
              ? `${language} is not documented for this model`
              : "Language is set to Auto"}</b>
        <p>{status === "documented"
          ? `Alibaba lists ${language} for this exact model binding.`
          : status === "unavailable"
              ? "You can still generate. Alibaba may reject it or return an unreliable result."
              : "Choose a language beside the script only when you want to be explicit."}</p>
      </div>
    </div>
    <details>
      <summary><Languages /> {officialCoverageLabel(route)}</summary>
      {route.languages.length
        ? <div className="voice-language-list">{route.languages.map((item) => <span className={explicitLanguage && item.toLocaleLowerCase() === language.toLocaleLowerCase() ? "current" : ""} key={item}>{item}</span>)}</div>
        : <p>Alibaba has not published a language list for this binding.</p>}
    </details>
  </section>
}
