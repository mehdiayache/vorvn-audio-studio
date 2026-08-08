import { AudioLines, Download, LoaderCircle, Pause, Play, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { PlayerState } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import type { PlayerSource } from "@/types/domain"

import "./audio-player-dock.css"

export function AudioPlayerDock({ source, state, currentTime, duration, label = "Audio", onToggle, onSeek, onClose }: {
  source: PlayerSource | null
  state: PlayerState
  currentTime: number
  duration: number
  label?: string
  onToggle: () => void
  onSeek: (seconds: number) => void
  onClose: () => void
}) {
  if (!source) return null
  return <section className="audio-player-dock" aria-label={`${label} player`}>
    <span className="audio-dock-art">{source.artwork ? <img src={source.artwork} alt="" /> : <AudioLines />}</span>
    <div className="audio-dock-copy"><small>{label}</small><b>{source.title}</b><span>{source.subtitle}</span></div>
    <Button className="audio-dock-transport" size="icon" onClick={onToggle} aria-label={state === "playing" ? "Pause" : "Play"}>{state === "loading" ? <LoaderCircle className="spin" /> : state === "playing" ? <Pause /> : <Play />}</Button>
    <span className="audio-dock-time">{formatDuration(currentTime)}</span>
    <Slider className="audio-dock-seek" value={[currentTime]} max={Math.max(duration, 1)} step={0.1} onValueChange={([value = 0]) => onSeek(value)} aria-label="Playback position" />
    <span className="audio-dock-time">{formatDuration(duration)}</span>
    <Button variant="ghost" size="icon" asChild><a href={source.url} download aria-label="Download audio"><Download /></a></Button>
    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close player"><X /></Button>
    {state === "error" && <span className="audio-dock-error">This audio could not be played.</span>}
  </section>
}
