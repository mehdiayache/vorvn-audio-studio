import { StudioTimelineToolbar } from "@/components/studio-timeline-controls"
import type { TimelineHistoryDomain } from "./use-timeline-history"

const domainLabel = (domain: TimelineHistoryDomain) => domain === "visual" ? "visual" : "audio"

export function TimelineToolbar({ undoDomain, redoDomain, hasVisualScene, ...props }: {
  canUndo: boolean; canRedo: boolean; undoDomain: TimelineHistoryDomain; redoDomain: TimelineHistoryDomain
  saving: boolean; snapping: boolean; followPlayhead: boolean; hasVisualScene: boolean
  onUndo: () => void; onRedo: () => void; onMoveView: (direction: -1 | 1) => void
  onSnappingChange: (enabled: boolean) => void; onFollowPlayheadChange: (enabled: boolean) => void
  onAddVisual: () => void; onAddAudio: () => void
}) {
  return <StudioTimelineToolbar {...props}
    undoLabel={`Undo ${domainLabel(undoDomain)} edit`}
    redoLabel={`Redo ${domainLabel(redoDomain)} edit`}
    onAddVisual={hasVisualScene ? props.onAddVisual : undefined}
  />
}
