import { CheckCircle2, CircleAlert, Languages } from "lucide-react"

import { officialCoverageLabel, voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { VoiceChoice } from "@/lib/voice-options"

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
      <span>{status === "documented" ? <CheckCircle2 /> : status === "experimental" || status === "unavailable" ? <CircleAlert /> : <Languages />}</span>
      <div>
        <b>{status === "documented"
          ? `${language} is officially supported`
          : status === "experimental"
            ? `${language} is experimental with this model`
            : status === "unavailable"
              ? `${language} is not offered for this Alibaba voice`
              : "Language compatibility will follow your selection"}</b>
        <p>{status === "documented"
          ? `Alibaba lists ${language} for this exact model binding.`
          : status === "experimental"
            ? `Alibaba does not list ${language} for this model. You can still try it; the provider may reject it or produce an unreliable result.`
            : status === "unavailable"
              ? "Choose another recording method or language."
              : "Auto detects the script language. The selected model's official coverage is shown below."}</p>
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
