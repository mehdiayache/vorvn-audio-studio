import { AudioLines, LoaderCircle, Pause, Play, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { PlayerState } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import type { PlayerSource } from "@/types/domain"

export function VoicePreviewDock({ source, state, currentTime, duration, onToggle, onSeek, onClose }: {
  source: PlayerSource | null
  state: PlayerState
  currentTime: number
  duration: number
  onToggle: () => void
  onSeek: (seconds: number) => void
  onClose: () => void
}) {
  if (!source) return null
  return <section className="voice-preview-dock" aria-label="Voice preview player">
    <span className="voice-preview-art">{source.artwork ? <img src={source.artwork} alt="" /> : <AudioLines />}</span>
    <div className="voice-preview-copy"><small>Latest generated sample</small><b>{source.title}</b><span>{source.subtitle}</span></div>
    <Button className="voice-preview-transport" size="icon" onClick={onToggle} aria-label={state === "playing" ? "Pause voice preview" : "Play voice preview"}>{state === "loading" ? <LoaderCircle className="spin" /> : state === "playing" ? <Pause /> : <Play />}</Button>
    <span className="voice-preview-time">{formatDuration(currentTime)}</span>
    <Slider className="voice-preview-seek" value={[currentTime]} max={Math.max(duration, 1)} step={0.1} onValueChange={([value = 0]) => onSeek(value)} aria-label="Voice preview position" />
    <span className="voice-preview-time">{formatDuration(duration)}</span>
    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close voice preview"><X /></Button>
    {state === "error" && <span className="voice-preview-error">This sample could not be played.</span>}
  </section>
}
