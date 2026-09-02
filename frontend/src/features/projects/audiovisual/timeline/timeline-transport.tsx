import { Pause, Play } from "lucide-react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { useSoundSceneSession, type SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import { formatTimecode } from "@/lib/format"

export function TimelineTransport({ session, onActivateTimeline }: { session: SoundSceneSession; onActivateTimeline?: () => void }) {
  const { scene, playback, playhead } = useSoundSceneSession(session)
  const player = useGlobalPlayer()
  const duration = Math.max(0, Number(scene.resolved.duration_ms || scene.resolved.sequence_projection.duration_ms) / 1_000)
  const current = Math.max(0, Math.min(duration, Number(playhead) || 0))
  const playing = playback === "playing"
  const preparing = playback === "preparing"
  const available = Boolean(scene.sequence_stem.url || scene.resolved.tracks.some((track) => track.clips.some((clip) => clip.filename && !clip.missing && !clip.orphan)))
  return <div className="timeline-inline-transport" aria-label="Timeline transport">
    <OperatorIconButton label={playing ? "Pause Timeline" : "Play Timeline"} detail={!available ? "Add or record audible material before playback." : "Controls the complete Project mix."} disabled={!available} busy={preparing} busyLabel="Preparing Timeline" onClick={() => { onActivateTimeline?.(); player.close(); void session.togglePlayback() }}>{playing ? <Pause /> : <Play />}</OperatorIconButton>
    <span><b>{formatTimecode(current)}</b><i>/</i><b>{formatTimecode(duration)}</b></span>
  </div>
}
