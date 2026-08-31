import { Pause, Play } from "lucide-react"
import { useSyncExternalStore } from "react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { useSoundSceneSession, type SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import { formatDuration } from "@/lib/format"

export function TimelineTransport({ session, onActivateTimeline }: { session: SoundSceneSession; onActivateTimeline?: () => void }) {
  const { scene, playback, playhead } = useSoundSceneSession(session)
  const player = useGlobalPlayer()
  const meter = useSyncExternalStore(session.subscribeMeter, session.meterSnapshot, session.meterSnapshot)
  const duration = Math.max(0, Number(scene.resolved.duration_ms || scene.resolved.sequence_projection.duration_ms) / 1_000)
  const current = Math.max(0, Math.min(duration, Number(playhead) || 0))
  const playing = playback === "playing"
  const preparing = playback === "preparing"
  const available = Boolean(scene.sequence_stem.url || scene.resolved.tracks.some((track) => track.clips.some((clip) => clip.filename && !clip.missing && !clip.orphan)))
  return <div className="timeline-inline-transport" aria-label="Timeline transport">
    <OperatorIconButton label={playing ? "Pause Timeline" : "Play Timeline"} detail={!available ? "Add or record audible material before playback." : "Controls the complete Production mix."} disabled={!available} busy={preparing} busyLabel="Preparing Timeline" onClick={() => { onActivateTimeline?.(); player.pause(); void session.togglePlayback() }}>{playing ? <Pause /> : <Play />}</OperatorIconButton>
    <span>{formatDuration(current)}</span>
    <Slider value={[current]} max={Math.max(duration, 1)} step={.05} onValueChange={([value = 0]) => { onActivateTimeline?.(); session.seek(value) }} aria-label="Timeline playback position" />
    <span>{formatDuration(duration)}</span>
    <div className="timeline-inline-meter" role="meter" aria-label={`Master level ${Math.round(meter.peak * 100)} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter.peak * 100)}><i style={{ transform: `scaleX(${Math.max(meter.left, meter.right)})` }} /></div>
  </div>
}
