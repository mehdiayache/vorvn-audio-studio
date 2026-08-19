import { AudioLines, Pause, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"
import { SoundSceneSession, useSoundSceneSession } from "./engine/sound-scene-session"

export function SoundSceneTransport({ session }: { session: SoundSceneSession }) {
  const { scene, playing, playhead, error } = useSoundSceneSession(session)
  const duration = Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1000
  const boundedPlayhead = Math.max(0, Math.min(duration, Number(playhead) || 0))
  const available = Boolean(scene.sequence_stem.url || scene.resolved.tracks.some((track) => track.clips.some((clip) => clip.filename && !clip.missing && !clip.orphan)))
  return <section className="transport-strip is-production is-sound-scene" aria-label="Sound Scene player">
    <span className="transport-strip-art" aria-hidden="true"><AudioLines /></span>
    <div className="transport-strip-copy"><small>Sound Scene</small><b>Sequence + {scene.resolved.tracks.reduce((count, track) => count + track.clips.length, 0)} sound clips</b></div>
    <Button className="transport-strip-play" size="icon" disabled={!available} onClick={() => void session.togglePlayback()} aria-label={playing ? "Pause Sound Scene" : "Play Sound Scene"}>{playing ? <Pause /> : <Play />}</Button>
    <span className="transport-strip-time">{formatDuration(boundedPlayhead)}</span>
    <Slider className="transport-strip-seek" value={[boundedPlayhead]} max={Math.max(duration, 1)} step={0.05} onValueChange={([value = 0]) => session.seek(value)} aria-label="Sound Scene playback position" />
    <span className="transport-strip-time">{formatDuration(duration)}</span>
    {error && <p className="transport-strip-error" role="alert">{error}</p>}
  </section>
}
