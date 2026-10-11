import type { ComponentProps } from "react"
import { VisualTimelineSection as StudioVisualTimelineSection, VisualTrackHeaders as StudioVisualTrackHeaders } from "@/components/studio-timeline/visual-timeline-section"
import { visualTimelineFile } from "@/features/visual-scene/timeline/visual-timeline-parts"
import type { WorkspaceFile, VisualSceneTrack } from "@/types/domain"

type HeadersProps = Omit<ComponentProps<typeof StudioVisualTrackHeaders>, "tracks" | "files" | "onVisible" | "onLocked" | "onRemove"> & {
  tracks: VisualSceneTrack[]; files: WorkspaceFile[]
  onVisible: (track: VisualSceneTrack) => void
  onLocked: (track: VisualSceneTrack) => void
  onRemove: (track: VisualSceneTrack) => void
}
export function VisualTrackHeaders(props: HeadersProps) {
  const original = (id: string) => props.tracks.find(track => track.id === id)
  return <StudioVisualTrackHeaders {...props} files={props.files.map(visualTimelineFile)}
    onVisible={track => { const value = original(track.id); if (value) props.onVisible(value) }}
    onLocked={track => { const value = original(track.id); if (value) props.onLocked(value) }}
    onRemove={track => { const value = original(track.id); if (value) props.onRemove(value) }} />
}
export function VisualTimelineSection(props: Omit<ComponentProps<typeof StudioVisualTimelineSection>, "tracks" | "files"> & { tracks: VisualSceneTrack[]; files: WorkspaceFile[] }) {
  return <StudioVisualTimelineSection {...props} files={props.files.map(visualTimelineFile)} />
}
