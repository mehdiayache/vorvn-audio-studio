import { Check, ChevronDown, Pause, Play, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { VoiceIdentity } from "@/components/voice-identity"
import { cn } from "@/lib/utils"
import { languageDisplay, languageFlag, resolveVoice } from "@/lib/voice"
import type { VoiceIdentityChoice } from "@/lib/voice-options"
import type { PlayerSource, VoiceDirectory } from "@/types/domain"

export function VoicePicker({ identities, value, directory, playingKey, playerPlaying, onChange, onPlay }: {
  identities: VoiceIdentityChoice[]
  value: string
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onChange: (identity: VoiceIdentityChoice) => void
  onPlay: (source: PlayerSource) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => {
    return identities.filter((identity) => {
      const route = identity.routes[0]
      const voice = resolveVoice(route?.id, directory, identity.identityId)
      return `${voice.name} ${voice.detail} ${identity.name} ${identity.description} ${identity.editorialLanguage}`
        .toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [directory, identities, normalizedQuery])
  const groups = [
    { key: "owned", label: "Your voices", identities: filtered.filter((item) => item.source === "owned") },
    { key: "catalogue", label: "Provider catalogue", identities: filtered.filter((item) => item.source === "catalogue") },
  ].filter((group) => group.identities.length)
  const selected = identities.find((identity) => identity.identityId === value)
  const selectedRoute = selected?.routes[0]

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="voice-picker-trigger" aria-label="Choose a voice" aria-expanded={open}>
        {selectedRoute
          ? <VoiceIdentity voice={selectedRoute.id} identityId={selected?.identityId} directory={directory} compact showDetail={false} />
          : <span className="voice-picker-placeholder">Choose a voice</span>}
        <ChevronDown className="voice-picker-chevron" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="voice-picker-popover" align="start" sideOffset={6}>
      <header className="voice-picker-header"><div><b>Choose a voice</b><span>{identities.length} available</span></div><small>Choose the identity first. Output language and capability come next.</small></header>
      <label className="voice-picker-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all voices" autoFocus />
      </label>
      <div className="voice-picker-list">
        {groups.map((group) => <section className="voice-picker-group" key={group.key} aria-label={group.label}>
          <h4>{group.label}<span>{group.identities.length}</span></h4>
          {group.identities.map((identity) => {
            const route = identity.routes[0]!
            const voice = resolveVoice(route.id, directory, identity.identityId)
            const key = `voice:${identity.identityId}`
            const playing = playerPlaying && playingKey === key
            const isSelected = value === identity.identityId
            const capabilityCount = new Set(identity.routes.map((item) => item.engine)).size
            const qualification = identity.editorialLanguage
              ? `${languageFlag(identity.editorialLanguage)} ${languageDisplay(identity.editorialLanguage)} focus · ${capabilityCount} ${capabilityCount === 1 ? "capability" : "capabilities"}`
              : identity.description || `${capabilityCount} ${capabilityCount === 1 ? "capability" : "capabilities"}`
            return <div className={cn("voice-picker-row", isSelected && "selected")} key={identity.identityId}>
              <button type="button" className="voice-picker-select" onClick={() => { onChange(identity); setOpen(false) }}>
                <VoiceIdentity voice={route.id} identityId={identity.identityId} directory={directory} compact showDetail={false} />
                <small className="voice-source-qualification">{qualification}</small>
                {isSelected && <Check aria-hidden="true" />}
              </button>
              {voice.preview
                ? <Button type="button" variant="ghost" size="icon" className="voice-preview-action" aria-label={`${playing ? "Pause" : "Preview"} ${voice.name}`} onClick={() => onPlay({ key, url: voice.preview!, title: voice.name, subtitle: "Voice preview", artwork: voice.image, kind: "voice" })}>{playing ? <Pause /> : <Play />}</Button>
                : <span className="voice-preview-unavailable" title={`No preview is available for ${voice.name}`}>No preview</span>}
            </div>
          })}
        </section>)}
        {!filtered.length && <div className="voice-picker-empty"><b>No matching voice</b><span>Try a different name or description.</span></div>}
      </div>
    </PopoverContent>
  </Popover>
}
