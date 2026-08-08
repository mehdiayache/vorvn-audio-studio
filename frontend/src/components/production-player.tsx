import { AudioLines, ChevronDown, ChevronUp, Download, LoaderCircle, Music2, Pause, Play, RotateCcw, Volume1 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"
import type { PlayerSource } from "@/types/domain"
import type { PlayerState } from "@/hooks/use-player"

export function ProductionPlayer({ source, state, currentTime, duration, volume, speed, productionTitle, productionSubtitle, productionDuration, previewing, musicName, suppressed = false, onToggle, onSeek, onVolume, onSpeed, onClose, onPlayProduction, onOpenMusic }: {
  source: PlayerSource | null
  state: PlayerState
  currentTime: number
  duration: number
  volume: number
  speed: number
  productionTitle: string
  productionSubtitle: string
  productionDuration: number
  previewing: boolean
  musicName?: string
  suppressed?: boolean
  onToggle: () => void
  onSeek: (seconds: number) => void
  onVolume: (volume: number) => void
  onSpeed: (speed: number) => void
  onClose: () => void
  onPlayProduction: () => void
  onOpenMusic: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isProduction = !source || source.kind === "preview"
  const resourceLabel = isProduction ? "Full production" : source.kind === "music" ? "Music audition" : source.kind === "asset" ? "Linked Venture asset" : "Individual take"
  const shownTitle = source?.title || productionTitle
  const shownSubtitle = state === "loading" || previewing ? "Preparing audio…" : source?.subtitle || productionSubtitle
  const shownDuration = source ? duration : productionDuration
  const play = () => isProduction ? onPlayProduction() : onToggle()
  if (suppressed) return null
  return (
    <section className={`production-player ${expanded ? "expanded" : ""} ${!source ? "idle" : ""}`} aria-label="Production player">
      <div className="player-art">{source?.artwork ? <img src={source.artwork} alt="" /> : <AudioLines />}</div>
      <div className="player-copy"><small>{resourceLabel}</small><b>{shownTitle}</b><span>{shownSubtitle}</span></div>
      <Button className="transport" size="icon" onClick={play} disabled={previewing} aria-label={isProduction && !source ? "Play full production" : state === "playing" ? "Pause" : "Play"}>{previewing ? <LoaderCircle className="spin" /> : state === "playing" ? <Pause /> : <Play />}</Button>
      <span className="player-time">{formatDuration(source ? currentTime : 0)}</span>
      <Slider className="player-seek" value={[source ? currentTime : 0]} max={Math.max(shownDuration, 1)} step={0.1} disabled={!source} onValueChange={([value = 0]) => onSeek(value)} aria-label="Playback position" />
      <span className="player-time">{formatDuration(shownDuration)}</span>
      <Volume1 className="volume-icon" />
      <Slider className="player-volume" value={[volume]} max={1} step={0.02} onValueChange={([value = 0]) => onVolume(value)} aria-label="Player volume" />
      {source && !isProduction ? <Button variant="ghost" size="icon" onClick={onClose} aria-label="Return to full production"><RotateCcw /></Button> : <Button variant="ghost" size="icon" onClick={onOpenMusic} aria-label="Open music controls"><Music2 /></Button>}
      <Button variant="ghost" size="icon" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Collapse player" : "Expand player"}>{expanded ? <ChevronDown /> : <ChevronUp />}</Button>
      {expanded && <div className="player-extra">
        <Button variant="outline" size="sm" onClick={() => onSpeed(speed >= 2 ? 0.75 : speed + 0.25)}>{speed.toFixed(2).replace(/\.00$/, "")}× speed</Button>
        <Button variant="outline" size="sm" onClick={onOpenMusic}><Music2 /> {musicName || "Add music"}</Button>
        {!isProduction && <Button variant="outline" size="sm" onClick={onPlayProduction}><AudioLines /> Play full production</Button>}
        {source && source.kind !== "preview" && <Button variant="outline" size="sm" asChild><a href={source.url} download><Download /> Download source</a></Button>}
      </div>}
      {state === "error" && <div className="player-error">This audio could not be played.</div>}
    </section>
  )
}
