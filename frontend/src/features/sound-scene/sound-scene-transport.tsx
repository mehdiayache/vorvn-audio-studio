import { AudioLines, Pause, Play } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"
import { SoundSceneSession, useSoundSceneSession } from "./engine/sound-scene-session"

export function SoundSceneTransport({ session }: { session: SoundSceneSession }) {
  const { scene, playback, playhead, error } = useSoundSceneSession(session)
  const playing = playback === "playing"
  const preparing = playback === "preparing"
  const duration = Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1000
  const boundedPlayhead = Math.max(0, Math.min(duration, Number(playhead) || 0))
  const available = Boolean(scene.sequence_stem.url || scene.resolved.tracks.some((track) => track.clips.some((clip) => clip.filename && !clip.missing && !clip.orphan)))
  return <section className="transport-strip is-production is-sound-scene" aria-label="Sound Scene player">
    <span className="transport-strip-art" aria-hidden="true"><AudioLines /></span>
    <div className="transport-strip-copy"><small>Sound Scene</small><b>Sequence + {scene.resolved.tracks.reduce((count, track) => count + track.clips.length, 0)} sound clips</b></div>
    <OperatorIconButton className="transport-strip-play" size="icon" variant="default" disabled={!available} busy={preparing} busyLabel="Preparing Sound Scene audio" label={playing ? "Pause Sound Scene" : "Play Sound Scene"} detail={!available ? "Add or record audible material before playback." : undefined} onClick={() => void session.togglePlayback()}>{playing ? <Pause /> : <Play />}</OperatorIconButton>
    <span className="transport-strip-time">{formatDuration(boundedPlayhead)}</span>
    <Slider className="transport-strip-seek" value={[boundedPlayhead]} max={Math.max(duration, 1)} step={0.05} onValueChange={([value = 0]) => session.seek(value)} aria-label="Sound Scene playback position" />
    <span className="transport-strip-time">{formatDuration(duration)}</span>
    {error && <p className="transport-strip-error" role="alert">{error}</p>}
  </section>
}
