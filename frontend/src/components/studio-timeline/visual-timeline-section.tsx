import { Plus } from "lucide-react"
import type { CSSProperties, PointerEvent as ReactPointerEvent, SyntheticEvent } from "react"

import { VisualTimelineClip, VisualTrackControl } from "./visual-timeline-parts"
import { cn } from "@/lib/utils"
import type { WorkspaceFile, VisualSceneTrack, VisualClipRef } from "./studio-timeline-model"

export function VisualTrackHeaders({ tracks, files, collapsed, onVisible, onLocked, onAdd, onMove, onRename, onRemove, disabled = false }: {
  tracks: VisualSceneTrack[]
  files: WorkspaceFile[]
  collapsed: boolean
  disabled?: boolean
  onVisible: (track: VisualSceneTrack) => void
  onLocked: (track: VisualSceneTrack) => void
  onAdd: (trackId: string) => void
  onMove: (trackId: string, direction: -1 | 1) => void
  onRename: (trackId: string, name: string) => void
  onRemove: (track: VisualSceneTrack) => void
}) {
  return <>{tracks.map((track, index) => <VisualTrackControl
    key={track.id}
    track={track}
    files={files}
    collapsed={collapsed}
    disabled={disabled}
    first={index === 0}
    last={index === tracks.length - 1}
    onVisible={() => onVisible(track)}
    onLocked={() => onLocked(track)}
    onAdd={() => onAdd(track.id)}
    onMove={(direction) => onMove(track.id, direction)}
    onRename={(name) => onRename(track.id, name)}
    onRemove={() => onRemove(track)}
  />)}</>
}

export function VisualTimelineSection({ tracks, files, selection, styleFor, onSelect, onGesture, onAdd, onPan, editable = true }: {
  tracks: VisualSceneTrack[]
  files: WorkspaceFile[]
  selection: VisualClipRef[]
  editable?: boolean
  styleFor: (start: number, duration: number, minimum?: number) => CSSProperties
  onSelect: (event: SyntheticEvent, ref: VisualClipRef) => void
  onGesture: (event: ReactPointerEvent, ref: VisualClipRef, mode: "move" | "start" | "end") => void
  onAdd: (trackId: string) => void
  onPan: (event: ReactPointerEvent) => void
}) {
  const byId = new Map(files.map((file) => [file.id, file]))
  return <>{tracks.map((track) => <div className={cn("sound-scene-lane visual-scene-lane", !track.visible && "is-hidden")} key={track.id} onPointerDown={onPan}>
    {track.clips.map((clip) => {
      const ref = { trackId: track.id, clipId: clip.id }
      return <VisualTimelineClip
        key={clip.id}
        clip={clip}
        trackLocked={track.locked}
        editable={editable}
        file={byId.get(clip.file_id)}
        selected={selection.some((item) => item.trackId === track.id && item.clipId === clip.id)}
        style={styleFor(clip.start_ms / 1_000, clip.duration_ms / 1_000, 24)}
        onSelect={(event) => onSelect(event, ref)}
        onGesture={(event, mode) => onGesture(event, ref, mode)}
      />
    })}
    {!track.clips.length && <button className="sound-empty-lane" disabled={!editable || track.locked} onClick={() => onAdd(track.id)}><Plus /> Add media</button>}
  </div>)}</>
}
