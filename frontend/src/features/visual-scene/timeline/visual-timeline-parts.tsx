import type { ComponentProps } from "react"
import { VisualContextToolbar as StudioVisualContextToolbar, VisualTimelineClip as StudioVisualTimelineClip, VisualTrackControl as StudioVisualTrackControl, visualTrackDisplayName as studioVisualTrackDisplayName } from "@/components/studio-timeline/visual-timeline-parts"
import type { WorkspaceFile as StudioFile } from "@/components/studio-timeline/studio-timeline-model"
import { visualFileName, visualFilePosterUrl, visualFileUrl } from "@/features/files/file-presentation"
import type { WorkspaceFile, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

/** Resolve legacy URLs only at the original host boundary. Shared UI never authorizes media. */
export function visualTimelineFile(file: WorkspaceFile): StudioFile {
  return { id: file.id, name: visualFileName(file), filename: file.filename ?? undefined, media_type: file.media_type === "image" || file.media_type === "video" ? file.media_type : "audio", url: visualFileUrl(file), posterUrl: visualFilePosterUrl(file), duration_ms: file.duration_ms ?? undefined }
}
export function visualTrackDisplayName(track: VisualSceneTrack, files: WorkspaceFile[]) {
  void files
  return studioVisualTrackDisplayName(track, [])
}
export function VisualTrackControl(props: Omit<ComponentProps<typeof StudioVisualTrackControl>, "track" | "files"> & { track: VisualSceneTrack; files: WorkspaceFile[] }) {
  return <StudioVisualTrackControl {...props} files={props.files.map(visualTimelineFile)} />
}
export function VisualTimelineClip(props: Omit<ComponentProps<typeof StudioVisualTimelineClip>, "clip" | "file"> & { clip: VisualSceneClip; file?: WorkspaceFile }) {
  return <StudioVisualTimelineClip {...props} file={props.file && visualTimelineFile(props.file)} />
}
export function VisualContextToolbar(props: Omit<ComponentProps<typeof StudioVisualContextToolbar>, "track" | "clip" | "file"> & { track: VisualSceneTrack; clip: VisualSceneClip; file?: WorkspaceFile }) {
  return <StudioVisualContextToolbar {...props} file={props.file && visualTimelineFile(props.file)} />
}
