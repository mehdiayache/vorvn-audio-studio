import { Check, ChevronDown, Pause, Play, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VoiceIdentity } from "@/components/voice-identity"
import { cn } from "@/lib/utils"
import { resolveVoice } from "@/lib/voice"
import type { VoiceIdentityChoice } from "@/lib/voice-options"
import type { PlayerSource, VoiceDirectory } from "@/types/domain"

import "./voice-picker.css"

type GenderScope = "all" | "female" | "male"

function normalizedGender(value: string) {
  const gender = value.trim().toLocaleLowerCase()
  if (gender.includes("female") || gender.includes("woman")) return "female"
  if (gender.includes("male") || gender.includes("man")) return "male"
  return "unspecified"
}

function providerName(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

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
  const [gender, setGender] = useState<GenderScope>("all")
  const [provider, setProvider] = useState("all")
  const providers = useMemo(() => [...new Set(identities.flatMap((identity) => identity.routes.map((route) => route.provider)))].sort(), [identities])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => identities.filter((identity) => {
    const route = identity.routes[0]
    const voice = resolveVoice(route?.id, directory, identity.identityId)
    const routeProviders = identity.routes.map((item) => item.provider)
    const matchesQuery = `${voice.name} ${voice.detail} ${identity.name} ${identity.description} ${identity.gender} ${routeProviders.join(" ")}`
      .toLocaleLowerCase().includes(normalizedQuery)
    const matchesGender = gender === "all" || normalizedGender(identity.gender) === gender
    const matchesProvider = provider === "all" || routeProviders.includes(provider)
    return matchesQuery && matchesGender && matchesProvider
  }), [directory, gender, identities, normalizedQuery, provider])
  const groups = [
    { key: "owned", label: "Your voices", identities: filtered.filter((item) => item.source === "owned") },
    { key: "catalogue", label: "Catalogue", identities: filtered.filter((item) => item.source === "catalogue") },
  ].filter((group) => group.identities.length)
  const selected = identities.find((identity) => identity.identityId === value)
  const selectedRoute = selected?.routes[0]

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="voice-picker-trigger" aria-label="Choose a voice" aria-expanded={open}>
        {selectedRoute
          ? <><VoiceIdentity voice={selectedRoute.id} identityId={selected?.identityId} directory={directory} gender={selected?.gender} compact showDetail={false} showEditorialFlag={false} /><span className="voice-picker-selected-detail">{selected?.description || "Voice identity"}</span></>
          : <span className="voice-picker-placeholder">Choose a Voice</span>}
        <ChevronDown className="voice-picker-chevron" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="voice-picker-popover" align="start" sideOffset={6}>
      <header className="voice-picker-header"><div><b>Choose a Voice</b><span>{identities.length} available</span></div><small>Select the performer. Previewing never changes your choice.</small></header>
      <label className="voice-picker-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search voices, traits, or providers…" autoFocus />
      </label>
      <div className="voice-picker-filters">
        <div className="voice-picker-scope" role="group" aria-label="Voice gender">
          {(["all", "female", "male"] as const).map((item) => <Button key={item} type="button" size="sm" variant={gender === item ? "secondary" : "ghost"} aria-pressed={gender === item} onClick={() => setGender(item)}>{item[0]!.toUpperCase() + item.slice(1)}</Button>)}
        </div>
        <Select value={provider} onValueChange={setProvider}><SelectTrigger aria-label="Voice provider"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All providers</SelectItem>{providers.map((item) => <SelectItem key={item} value={item}>{providerName(item)}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="voice-picker-list">
        {groups.map((group) => <section className="voice-picker-group" key={group.key} aria-label={group.label}>
          <h4>{group.label}<span>{group.identities.length}</span></h4>
          {group.identities.map((identity) => {
            const route = identity.routes[0]!
            const voice = resolveVoice(route.id, directory, identity.identityId)
            const key = `voice:${identity.identityId}`
            const playing = playerPlaying && playingKey === key
            const isSelected = value === identity.identityId
            const methodCount = identity.routes.reduce((total, item) => total + Math.max(1, item.capabilities.length), 0)
            const providerLabel = [...new Set(identity.routes.map((item) => providerName(item.provider)))].join(", ")
            const qualification = [identity.description, providerLabel, `${methodCount} ${methodCount === 1 ? "method" : "methods"}`].filter(Boolean).join(" · ")
            return <div className={cn("voice-picker-row", isSelected && "selected")} key={identity.identityId}>
              <button type="button" className="voice-picker-select" onClick={() => { onChange(identity); setOpen(false) }}>
                <VoiceIdentity voice={route.id} identityId={identity.identityId} directory={directory} gender={identity.gender} showDetail={false} showEditorialFlag={false} />
                <small className="voice-source-qualification">{qualification}</small>
                {isSelected && <Check aria-hidden="true" />}
              </button>
              {voice.preview
                ? <Button type="button" variant="ghost" size="icon" className="voice-preview-action" aria-label={`${playing ? "Pause" : "Preview"} ${voice.name}`} onClick={() => onPlay({ key, url: voice.preview!, title: voice.name, subtitle: "Voice preview", artwork: voice.image, kind: "voice" })}>{playing ? <Pause /> : <Play />}</Button>
                : <span className="voice-preview-unavailable" title={`No preview is available for ${voice.name}`}>No preview</span>}
            </div>
          })}
        </section>)}
        {!filtered.length && <div className="voice-picker-empty"><b>No matching Voice</b><span>Clear a filter or try another search.</span></div>}
      </div>
    </PopoverContent>
  </Popover>
}
