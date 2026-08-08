import { Check, ChevronDown, Pause, Play, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { VoiceIdentity } from "@/components/voice-identity"
import { cn } from "@/lib/utils"
import { resolveVoice } from "@/lib/voice"
import type { VoiceChoice } from "@/lib/voice-options"
import type { PlayerSource, VoiceDirectory } from "@/types/domain"
import type { VoiceModelSummary } from "@/types/domain"

export function VoicePicker({ choices, summary, value, directory, engineLabel, modelLabel, playingKey, playerPlaying, onChange, onPlay }: {
  choices: VoiceChoice[]
  summary: VoiceModelSummary | null
  value: string
  directory: VoiceDirectory
  engineLabel: string
  modelLabel: string
  playingKey?: string
  playerPlaying: boolean
  onChange: (choice: VoiceChoice) => void
  onPlay: (source: PlayerSource) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [showAll, setShowAll] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => {
    const identities = new Map<string, VoiceChoice[]>()
    for (const choice of choices) {
      const routes = identities.get(choice.identityId) || []
      routes.push(choice); identities.set(choice.identityId, routes)
    }
    return [...identities.values()].flatMap((routes) => {
      const available = showAll ? routes : routes.filter((choice) => choice.compatible)
      if (!available.length) return []
      const currentEngine = summary?.engine
      const currentTier = summary?.tier
      const choice = available.find((item) => item.compatible) ||
        available.find((item) => item.engine === currentEngine && item.model === currentTier) ||
        available.find((item) => item.engine === currentEngine) ||
        available.find((item) => item.model === "plus") || available[0]
      if (!choice) return []
      const voice = resolveVoice(choice.id, directory)
      if (!`${voice.name} ${voice.detail} ${choice.name} ${choice.description}`.toLocaleLowerCase().includes(normalizedQuery)) return []
      return [{ choice, routes }]
    })
  }, [choices, directory, normalizedQuery, showAll, summary?.engine, summary?.tier])
  const groups = [
    { key: "mine", label: "Your voices", choices: filtered.filter((item) => item.choice.source === "mine") },
    { key: "alibaba", label: "Alibaba voices", choices: filtered.filter((item) => item.choice.source === "alibaba") },
  ].filter((group) => group.choices.length)

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setQuery(""); setShowAll(false) } }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="voice-picker-trigger" aria-label="Choose a voice" aria-expanded={open}>
        <VoiceIdentity voice={value} directory={directory} compact showDetail={false} />
        <ChevronDown className="voice-picker-chevron" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="voice-picker-popover" align="start" sideOffset={6}>
      <header className="voice-picker-header">
        <div><b>{engineLabel}</b><span>{modelLabel} · {summary?.total_count ?? choices.filter((choice) => choice.compatible).length} compatible</span></div>
        <small>{summary ? `${summary.system_count} Alibaba · ${summary.custom_count} yours` : "Loading the provider registry…"}</small>
      </header>
      <div className="voice-picker-scope" role="group" aria-label="Voice compatibility filter"><Button type="button" size="sm" variant={!showAll ? "secondary" : "ghost"} onClick={() => setShowAll(false)}>Compatible</Button><Button type="button" size="sm" variant={showAll ? "secondary" : "ghost"} onClick={() => setShowAll(true)}>All setups</Button></div>
      <label className="voice-picker-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all voices" autoFocus />
      </label>
      <div className="voice-picker-list">
        {groups.map((group) => <section className="voice-picker-group" key={group.key} aria-label={group.label}>
          <h4>{group.label}<span>{group.choices.length}</span></h4>
          {group.choices.map(({ choice, routes }) => {
            const voice = resolveVoice(choice.id, directory)
            const key = `voice:${choice.identityId}`
            const playing = playerPlaying && playingKey === key
            const selected = routes.some((route) => value === route.id)
            const routeLabels = [...new Set(routes.map((route) => `${route.engine === "omni" ? "Omni" : "Audio"} ${route.model === "plus" ? "Plus" : "Flash"}`))]
            return <div className={cn("voice-picker-row", selected && "selected")} key={choice.identityId}>
              <button type="button" className="voice-picker-select" onClick={() => { onChange(choice); setOpen(false) }}>
                <VoiceIdentity voice={choice.id} directory={directory} compact />
                {!choice.compatible && <small className="voice-route-requirement">Available in {routeLabels.join(" · ")}</small>}
                {selected && <Check aria-hidden="true" />}
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
