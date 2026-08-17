import { Mic2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"

import "./voice-identity.css"
import { languageDisplay, languageFlag, resolveVoice } from "@/lib/voice"
import type { VoiceDirectory } from "@/types/domain"

export function VoiceIdentity({ voice, identityId, directory, gender, compact = false, showDetail = true, showEditorialFlag = true, showCopy = true }: {
  voice?: string
  identityId?: string | null
  directory: VoiceDirectory
  gender?: string | null
  compact?: boolean
  showDetail?: boolean
  showEditorialFlag?: boolean
  showCopy?: boolean
}) {
  const resolved = resolveVoice(voice, directory, identityId)
  const initials = resolved.name.replace(/·.*$/, "").trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?"
  return (
    <span className={cn("voice-identity", compact && "compact")}>
      <span className="voice-portrait">{resolved.image ? <img src={resolved.image} alt="" /> : resolved.id ? initials : <Mic2 />}</span>
      {showCopy && <span className="voice-copy"><b className="voice-name-row">{showEditorialFlag && resolved.editorialLanguage && <span className="voice-source-flag" title={`${languageDisplay(resolved.editorialLanguage)} editorial focus`} aria-label={`${languageDisplay(resolved.editorialLanguage)} editorial focus`}>{languageFlag(resolved.editorialLanguage)}</span>}<span className="voice-display-name">{resolved.name}</span><VoiceGenderBadge gender={gender || resolved.gender} /></b>{showDetail && <small>{resolved.unavailable ? "Unavailable voice · existing recording" : resolved.detail}</small>}</span>}
    </span>
  )
}
