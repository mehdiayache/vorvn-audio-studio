import { languageDisplay, languageFlag } from "@/lib/voice"

export function VoiceLanguageBadge({ language }: { language?: string | null }) {
  const value = String(language || "").trim()
  if (!value) return null
  return <span className="voice-language-badge" aria-label={`${languageDisplay(value)} voice focus`}><span aria-hidden="true">{languageFlag(value)}</span>{languageDisplay(value)}</span>
}
