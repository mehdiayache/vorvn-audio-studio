import { AudioLines, Download, LoaderCircle, Pause, Play, Volume1, X } from "lucide-react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import type { TransportHost } from "@/components/global-player-provider"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { PlayerState } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import type { PlayerSource } from "@/types/domain"

import "./transport-strip.css"

const sourceLabels: Record<PlayerSource["kind"], string> = {
  take: "Recording",
  production: "Production preview",
  voice: "Voice preview",
  asset: "Venture audio",
  music: "Music",
  subtitle: "Subtitle source",
  batch: "Batch result",
  standalone: "Standalone recording",
}

export type TransportStripViewProps = {
  source: PlayerSource | null
  state: PlayerState
  currentTime: number
  duration: number
  volume: number
  speed: number
  onToggle: () => void
  onSeek: (seconds: number) => void
  onVolume: (volume: number) => void
  onSpeed: (speed: number) => void
  onClose: () => void
  variant?: TransportHost
}

export function TransportStripView({ source, state, currentTime, duration, volume, speed, onToggle, onSeek, onVolume, onSpeed, onClose, variant = "shell" }: TransportStripViewProps) {
  if (!source) return null
  const playLabel = state === "playing" ? `Pause ${source.title}` : `Play ${source.title}`
  return <section className={`transport-strip is-${variant}`} aria-label="Audio player" data-source-kind={source.kind}>
    <span className="transport-strip-art" aria-hidden="true">{source.artwork ? <img src={source.artwork} alt="" /> : <AudioLines />}</span>
    <div className="transport-strip-copy"><small>{sourceLabels[source.kind]}</small><b title={source.title}>{source.title}</b>{source.subtitle && <span title={source.subtitle}>{source.subtitle}</span>}</div>
    <Button className="transport-strip-play" size="icon" onClick={onToggle} aria-label={playLabel}>{state === "loading" ? <LoaderCircle className="spin" /> : state === "playing" ? <Pause /> : <Play />}</Button>
    <span className="transport-strip-time">{formatDuration(currentTime)}</span>
    <Slider className="transport-strip-seek" value={[currentTime]} max={Math.max(duration, 1)} step={0.1} onValueChange={([value = 0]) => onSeek(value)} aria-label="Playback position" />
    <span className="transport-strip-time">{formatDuration(duration)}</span>
    <Volume1 className="transport-strip-volume-icon" aria-hidden="true" />
    <Slider className="transport-strip-volume" value={[volume]} max={1} step={0.02} onValueChange={([value = 0]) => onVolume(value)} aria-label="Playback volume" />
    <Button className="transport-strip-speed" variant="ghost" size="sm" onClick={() => onSpeed(speed >= 2 ? 0.75 : speed + 0.25)} aria-label={`Playback speed ${speed.toFixed(2)} times`}>{speed.toFixed(2).replace(/\.00$/, "")}×</Button>
    {source.kind !== "production" && <Button variant="ghost" size="icon" asChild><a href={source.url} download aria-label={`Download ${source.title}`}><Download /></a></Button>}
    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close audio player"><X /></Button>
    {state === "error" && <p className="transport-strip-error" role="alert">This audio could not be played.</p>}
  </section>
}

export function TransportStrip({ host = "shell" }: { host?: TransportHost }) {
  const player = useGlobalPlayer()
  if (player.transportHost !== host) return null
  return <TransportStripView variant={host} source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} volume={player.volume} speed={player.speed} onToggle={() => void player.toggle()} onSeek={player.seek} onVolume={player.setVolume} onSpeed={player.setSpeed} onClose={player.close} />
}
