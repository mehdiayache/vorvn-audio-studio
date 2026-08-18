import { useMemo, useState, type CSSProperties } from "react"
import { AudioLines, ChevronLeft, ChevronRight, Clock3, Headphones, Music2, Plus, Search, SlidersHorizontal, Volume2, Waves } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AudioWaveform } from "@/components/audio-waveform"
import { Slider } from "@/components/ui/slider"
import { audioUrl } from "@/lib/api"
import { buildProductionTiming } from "@/lib/production-timing"
import { cn } from "@/lib/utils"
import { formatAuthoredRole, formatDuration } from "@/lib/format"
import type { MusicBed, ProductionPart } from "@/types/domain"
import { WorkstationPaneHeader } from "./workstation-pane-header"

type SoundSelection = { kind: "part"; id: number } | { kind: "music" } | null

function timeMarks(total: number) {
  const step = total > 600 ? 60 : total > 240 ? 30 : total > 90 ? 15 : 10
  return Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step)
}

function roleColor(role?: string | null) {
  const palette = ["violet", "blue", "teal", "amber", "rose"]
  const value = String(role || "voice")
  const hash = Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function TrackLabels({ music, voiceParts, sfxParts, selection, onSelection, onAddSound }: {
  music: MusicBed
  voiceParts: ProductionPart[]
  sfxParts: ProductionPart[]
  selection: SoundSelection
  onSelection: (selection: SoundSelection) => void
  onAddSound: () => void
}) {
  const selectedPartId = selection?.kind === "part" ? selection.id : null
  const voiceActive = selectedPartId == null && selection?.kind !== "music" || voiceParts.some((part) => part.id === selectedPartId)
  const sfxActive = sfxParts.some((part) => part.id === selectedPartId)
  return <div className="ws-track-list">
    <button className={voiceActive ? "is-active" : ""} onClick={() => onSelection(voiceParts[0] ? { kind: "part", id: voiceParts[0].id } : null)}><span className="ws-track-icon is-voice"><AudioLines /></span><span><b>Voice</b><small>{voiceParts.length} clips</small></span><Volume2 /></button>
    <button className={sfxActive ? "is-active" : ""} onClick={() => sfxParts[0] ? onSelection({ kind: "part", id: sfxParts[0].id }) : onAddSound()}><span className="ws-track-icon is-sfx"><Waves /></span><span><b>SFX</b><small>{sfxParts.length ? `${sfxParts.length} clips` : "Ready for sound"}</small></span><Volume2 /></button>
    <button onClick={onAddSound}><span className="ws-track-icon is-ambience"><Headphones /></span><span><b>Ambience</b><small>No ambience yet</small></span><Volume2 /></button>
    <button className={selection?.kind === "music" ? "is-active" : ""} onClick={() => music.filename ? onSelection({ kind: "music" }) : onAddSound()}><span className="ws-track-icon is-music"><Music2 /></span><span><b>Music</b><small>{music.filename ? music.name || "Music bed" : "No music"}</small></span><Volume2 /></button>
    <button className="ws-track-add" onClick={onAddSound}><Plus /><span><b>Add sound</b><small>SFX, atmosphere, or music</small></span></button>
  </div>
}

export function SoundDesignOutline({ music, parts, selection, onSelection, onAddSound, onCollapse }: {
  music: MusicBed
  parts: ProductionPart[]
  selection: SoundSelection
  onSelection: (selection: SoundSelection) => void
  onAddSound: () => void
  onCollapse: () => void
}) {
  const timing = buildProductionTiming(parts)
  return <div className="ws-sound-outline">
    <WorkstationPaneHeader title="Tracks" meta="Sound scene" onCollapse={onCollapse} />
    <TrackLabels music={music} voiceParts={timing.narration.map(({ part }) => part)} sfxParts={timing.sfx.map(({ part }) => part)} selection={selection} onSelection={onSelection} onAddSound={onAddSound} />
    <Button variant="outline" onClick={onAddSound}><Plus /> Add or choose sound</Button>
  </div>
}

export function WorkstationSoundDesign({ parts, music, selection, onSelection, onAddSound }: {
  parts: ProductionPart[]
  music: MusicBed
  selection: SoundSelection
  onSelection: (selection: SoundSelection) => void
  onAddSound: () => void
}) {
  const timing = useMemo(() => buildProductionTiming(parts), [parts])
  const [zoom, setZoom] = useState(10)
  const total = Math.max(timing.total, 1)
  const width = Math.max(920, total * zoom)
  const marks = timeMarks(total)
  const styleFor = (start: number, duration: number) => ({ left: `${start * zoom}px`, width: `${Math.max(duration * zoom, 18)}px` } as CSSProperties)
  return <div className="ws-sound-canvas">
    <header className="ws-canvas-heading ws-sound-heading"><div className="ws-heading-copy"><h2>Sound scene</h2><p>Shape space around the story.</p></div><div className="ws-timeline-tools"><Button variant="ghost" size="icon-sm"><Search /></Button><Button variant="ghost" size="icon-sm"><ChevronLeft /></Button><Slider aria-label="Timeline zoom" min={5} max={28} step={1} value={[zoom]} onValueChange={([next = 10]) => setZoom(next)} /><Button variant="ghost" size="icon-sm"><ChevronRight /></Button><span>{zoom}px/s</span></div></header>
    <div className="ws-timeline-scroll">
      <div className="ws-timeline" style={{ width }}>
        <div className="ws-ruler">{marks.map((mark) => <span key={mark} style={{ left: mark * zoom }}><i />{formatDuration(mark)}</span>)}</div>
        <div className="ws-lane is-voice" aria-label="Voice track">
          {timing.narration.map((span) => <button key={span.part.id} className={cn("ws-timeline-clip", `is-${roleColor(span.part.authored_role)}`, selection?.kind === "part" && selection.id === span.part.id && "is-selected", span.part.enabled === false && "is-disabled")} style={styleFor(span.start, span.duration)} onClick={() => onSelection({ kind: "part", id: span.part.id })} title={`${formatAuthoredRole(span.part.authored_role) || span.part.voice_name || "Voice"} · ${formatDuration(span.duration)}`}>
            {span.part.filename && <AudioWaveform url={audioUrl(span.part.filename)} bars={48} />}
            <span className="ws-timeline-clip-label"><em>{String(span.number).padStart(2, "0")}</em><b>{formatAuthoredRole(span.part.authored_role) || span.part.voice_name || "Voice"}</b></span>
          </button>)}
          {timing.silences.map((span) => <span key={span.part.id} className="ws-timeline-silence" style={styleFor(span.start, span.duration)} title={`${span.duration}s pause`}><Clock3 /></span>)}
        </div>
        <div className="ws-lane is-sfx" aria-label="Sound effects track">
          {timing.sfx.map((span) => <button key={span.part.id} className={cn("ws-timeline-clip is-sfx", selection?.kind === "part" && selection.id === span.part.id && "is-selected")} style={styleFor(span.start, span.duration)} onClick={() => onSelection({ kind: "part", id: span.part.id })}>{span.part.filename && <AudioWaveform url={audioUrl(span.part.filename)} bars={48} />}<span className="ws-timeline-clip-label"><Waves /><b>{span.part.title || "Linked audio"}</b></span></button>)}
          {!timing.sfx.length && <button className="ws-empty-lane-action" onClick={onAddSound}><Plus /> Add a moment of sound</button>}
        </div>
        <div className="ws-lane is-ambience" aria-label="Ambience track"><button className="ws-empty-lane-action" onClick={onAddSound}><Plus /> Add atmosphere</button></div>
        <div className="ws-lane is-music" aria-label="Music track">
          {music.filename ? <button className={cn("ws-music-clip", selection?.kind === "music" && "is-selected")} style={styleFor(0, Math.max(timing.total, 1))} onClick={() => onSelection({ kind: "music" })}><AudioWaveform url={audioUrl(music.filename)} bars={96} /><span className="ws-music-label"><Music2 /><span><b>{music.name || "Music bed"}</b><small>{Math.round(Number(music.volume ?? .18) * 100)}% · {music.duck ? "ducking on" : "ducking off"}</small></span></span><SlidersHorizontal /></button> : <button className="ws-empty-lane-action" onClick={onAddSound}><Plus /> Choose music</button>}
        </div>
      </div>
    </div>
    <footer className="ws-sound-status"><span><i className="is-voice" /> Voice</span><span><i className="is-sfx" /> SFX</span><span><i className="is-ambience" /> Ambience</span><span><i className="is-music" /> Music</span><b>{formatDuration(timing.total)} story</b></footer>
  </div>
}

export type { SoundSelection }
