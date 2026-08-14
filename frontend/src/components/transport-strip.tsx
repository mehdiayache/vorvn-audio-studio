import { AudioLines, Captions, Download, LoaderCircle, Pause, Play, RefreshCw, Volume1, X } from "lucide-react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import type { TransportHost } from "@/components/global-player-provider"
import { TransportCaptionPanel } from "@/components/transport-caption-panel"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { PlayerState } from "@/hooks/use-player"
import { DEFAULT_CAPTION_PRESENTATION } from "@/lib/caption-presentation"
import { formatDuration } from "@/lib/format"
import type { CaptionProfile, PlayerCaptionCue, PlayerCaptionTrack, PlayerSource } from "@/types/domain"

import "./transport-strip.css"

const sourceLabels: Record<PlayerSource["kind"], string> = {
  clip: "Recording",
  production: "Production preview",
  voice: "Voice preview",
  asset: "Venture audio",
  music: "Music",
  subtitle: "Subtitle source",
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
  captionTracks?: PlayerCaptionTrack[]
  captionTrack?: PlayerCaptionTrack | null
  captionsEnabled?: boolean
  currentCaptionCue?: PlayerCaptionCue | null
  onCaptionTrack?: (trackId: string | null) => void
  onToggleCaptions?: () => void
  captionProfile?: CaptionProfile
  onCaptionProfile?: (profile: CaptionProfile) => void
  onOpenCaptionContext?: (partId: number) => void
  previewStale?: boolean
  onRefreshPreview?: () => void
}

export function TransportStripView({ source, state, currentTime, duration, volume, speed, onToggle, onSeek, onVolume, onSpeed, onClose, variant = "shell", captionTracks = [], captionTrack = null, captionsEnabled = false, currentCaptionCue = null, onCaptionTrack, onToggleCaptions, captionProfile = DEFAULT_CAPTION_PRESENTATION, onCaptionProfile, onOpenCaptionContext, previewStale = false, onRefreshPreview }: TransportStripViewProps) {
  if (!source) return null
  const playLabel = state === "playing" ? `Pause ${source.title}` : `Play ${source.title}`
  const captionDockVisible = captionsEnabled && Boolean(captionTrack)
  return <section className={`transport-strip is-${variant}${captionTracks.length ? " has-caption-tracks" : ""}${captionDockVisible ? " has-caption-dock" : ""}${previewStale ? " is-stale" : ""}`} aria-label="Audio player" data-source-kind={source.kind} data-caption-profile={captionProfile}>
    {captionDockVisible && captionTrack && <TransportCaptionPanel tracks={captionTracks} track={captionTrack} profile={captionProfile} currentCue={currentCaptionCue} onTrackChange={onCaptionTrack} onProfileChange={onCaptionProfile} onOpenCue={onOpenCaptionContext} />}
    {previewStale && <div className="transport-preview-stale" role="status"><span>Preview out of date</span><Button variant="ghost" size="sm" onClick={onRefreshPreview}><RefreshCw /> Refresh</Button></div>}
    <span className="transport-strip-art" aria-hidden="true">{source.artwork ? <img src={source.artwork} alt="" /> : <AudioLines />}</span>
    <div className="transport-strip-copy"><small>{sourceLabels[source.kind]}</small><b title={source.title}>{source.title}</b>{source.subtitle && <span title={source.subtitle}>{source.subtitle}</span>}</div>
    <Button className="transport-strip-play" size="icon" onClick={onToggle} aria-label={playLabel}>{state === "loading" ? <LoaderCircle className="spin" /> : state === "playing" ? <Pause /> : <Play />}</Button>
    <span className="transport-strip-time">{formatDuration(currentTime)}</span>
    <Slider className="transport-strip-seek" value={[currentTime]} max={Math.max(duration, 1)} step={0.1} onValueChange={([value = 0]) => onSeek(value)} aria-label="Playback position" />
    <span className="transport-strip-time">{formatDuration(duration)}</span>
    <Volume1 className="transport-strip-volume-icon" aria-hidden="true" />
    <Slider className="transport-strip-volume" value={[volume]} max={1} step={0.02} onValueChange={([value = 0]) => onVolume(value)} aria-label="Playback volume" />
    <Button className="transport-strip-speed" variant="ghost" size="sm" onClick={() => onSpeed(speed >= 2 ? 0.75 : speed + 0.25)} aria-label={`Playback speed ${speed.toFixed(2)} times`}>{speed.toFixed(2).replace(/\.00$/, "")}×</Button>
    {captionTracks.length > 0 && <Button variant="ghost" size="icon" className={captionsEnabled ? "transport-cc is-on" : "transport-cc"} aria-label={captionsEnabled ? "Hide captions" : "Show captions"} aria-pressed={captionsEnabled} onClick={onToggleCaptions}><Captions /></Button>}
    {source.kind !== "production" && <Button variant="ghost" size="icon" asChild><a href={source.url} download aria-label={`Download ${source.title}`}><Download /></a></Button>}
    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close audio player"><X /></Button>
    {state === "error" && <p className="transport-strip-error" role="alert">This audio could not be played.</p>}
  </section>
}

export function TransportStrip({ host = "shell", onOpenCaptionContext, previewStale, onRefreshPreview }: { host?: TransportHost; onOpenCaptionContext?: (partId: number) => void; previewStale?: boolean; onRefreshPreview?: () => void }) {
  const player = useGlobalPlayer()
  if (player.transportHost !== host) return null
  return <TransportStripView variant={host} source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} volume={player.volume} speed={player.speed} captionTracks={player.captionTracks} captionTrack={player.captionTrack} captionProfile={player.captionProfile} captionsEnabled={player.captionsEnabled} currentCaptionCue={player.currentCaptionCue} onCaptionTrack={player.setCaptionTrack} onToggleCaptions={player.toggleCaptions} onCaptionProfile={player.setCaptionProfile} onOpenCaptionContext={onOpenCaptionContext} previewStale={previewStale} onRefreshPreview={onRefreshPreview} onToggle={() => void player.toggle()} onSeek={player.seek} onVolume={player.setVolume} onSpeed={player.setSpeed} onClose={player.close} />
}
