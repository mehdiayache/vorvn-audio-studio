import type { ComponentProps } from "react"
import { TimelineTrackControls as StudioTimelineTrackControls } from "@/components/studio-timeline/timeline-track-controls"
import { visualTimelineFile } from "@/features/visual-scene/timeline/visual-timeline-parts"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { SoundSceneTrack, VisualSceneTrack, WorkspaceFile } from "@/types/domain"

type Props = Omit<ComponentProps<typeof StudioTimelineTrackControls>, "audioSession" | "visualSession" | "audioTracks" | "visualTracks" | "files" | "onRemoveAudioTrack" | "onRemoveVisualTrack"> & {
  audioSession: SoundSceneSession; visualSession?: VisualSceneSession
  audioTracks: SoundSceneTrack[]; visualTracks: VisualSceneTrack[]; files: WorkspaceFile[]
  onRemoveAudioTrack: (track: SoundSceneTrack) => void
  onRemoveVisualTrack: (track: VisualSceneTrack) => void
}
export function TimelineTrackControls(props: Props) {
  return <StudioTimelineTrackControls {...props} files={props.files.map(visualTimelineFile)}
    onRemoveAudioTrack={track => { const original = props.audioTracks.find(value => value.id === track.id); if (original) props.onRemoveAudioTrack(original) }}
    onRemoveVisualTrack={track => { const original = props.visualTracks.find(value => value.id === track.id); if (original) props.onRemoveVisualTrack(original) }} />
}
