import {useGlobalPlayer} from '@/components/global-player-provider'
import {useSoundSceneSession,type SoundSceneSession} from '@/features/sound-scene/engine/sound-scene-session'
import {TimelineTransport as StudioTimelineTransport} from '../../../../components/studio-timeline/timeline-transport'

export function TimelineTransport({session,onActivateTimeline}:{session:SoundSceneSession;onActivateTimeline?:()=>void}) {
  const {scene,playback,playhead}=useSoundSceneSession(session),player=useGlobalPlayer()
  const duration=Math.max(0,Number(scene.resolved.duration_ms||scene.resolved.sequence_projection.duration_ms)/1_000)
  const available=Boolean(scene.sequence_stem.url||scene.resolved.tracks.some(track=>track.clips.some(clip=>clip.filename&&!clip.missing&&!clip.orphan)))
  return <StudioTimelineTransport duration={duration} current={playhead} playing={playback==='playing'} preparing={playback==='preparing'} available={available} onToggle={()=>{onActivateTimeline?.();player.close();void session.togglePlayback()}}/>
}
