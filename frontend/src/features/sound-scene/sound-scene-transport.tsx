import { AudioLines, Pause, Play } from "lucide-react"
import { useSyncExternalStore } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"
import { SoundSceneSession, useSoundSceneSession } from "./engine/sound-scene-session"

export function SoundSceneTransport({ session }: { session: SoundSceneSession }) {
  const { scene, playback, playhead, error } = useSoundSceneSession(session)
  const playing = playback === "playing"
  const preparing = playback === "preparing"
  const meter = useSyncExternalStore(session.subscribeMeter, session.meterSnapshot, session.meterSnapshot)
  const duration = Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1000
  const boundedPlayhead = Math.max(0, Math.min(duration, Number(playhead) || 0))
  const available = Boolean(scene.sequence_stem.url || scene.resolved.tracks.some((track) => track.clips.some((clip) => clip.filename && !clip.missing && !clip.orphan)))
  return <section className="transport-strip is-project is-sound-scene" aria-label="Timeline player">
    <span className="transport-strip-art" aria-hidden="true"><AudioLines /></span>
    <div className="transport-strip-copy"><small>Timeline</small><b>Script + {scene.resolved.tracks.reduce((count, track) => count + track.clips.length, 0)} sound clips</b></div>
    <OperatorIconButton className="transport-strip-play" size="icon" variant="default" disabled={!available} busy={preparing} busyLabel="Preparing Timeline audio" label={playing ? "Pause Timeline" : "Play Timeline"} detail={!available ? "Add or record audible material before playback." : undefined} onClick={() => void session.togglePlayback()}>{playing ? <Pause /> : <Play />}</OperatorIconButton>
    <span className="transport-strip-time">{formatDuration(boundedPlayhead)}</span>
    <Slider className="transport-strip-seek" value={[boundedPlayhead]} max={Math.max(duration, 1)} step={0.05} onValueChange={([value = 0]) => session.seek(value)} aria-label="Timeline playback position" />
    <span className="transport-strip-time">{formatDuration(duration)}</span>
    <div className="transport-meter" aria-label={`Master level. Left ${Math.round(meter.left * 100)} percent. Right ${Math.round(meter.right * 100)} percent${meter.clipping ? ". Clipping detected" : ""}.`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter.peak * 100)}>
      <small>L</small>
      <span><i style={{ transform: `scaleX(${meter.left})` }} /><em style={{ left: `${meter.peak * 100}%` }} /></span>
      <small>R</small>
      <span><i style={{ transform: `scaleX(${meter.right})` }} /><em style={{ left: `${meter.peak * 100}%` }} /></span>
      <b className={meter.clipping ? "is-clipping" : undefined}>PK</b>
    </div>
    {error && <p className="transport-strip-error" role="alert">{error}</p>}
  </section>
}
