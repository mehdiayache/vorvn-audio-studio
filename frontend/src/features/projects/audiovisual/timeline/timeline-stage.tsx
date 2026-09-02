import { useMemo, useState, type ComponentProps, type RefObject } from "react"

import { TimelineWorkspace } from "./timeline-workspace"
import { ProjectLibraryDialog } from "../library/project-library-dialog"
import { FilePreviewDialog } from "../library/file-preview-dialog"
import type { WorkspaceFile } from "@/types/domain"

type TimelineStageProps = ComponentProps<typeof TimelineWorkspace> & {
  centerPaneRef: RefObject<HTMLElement | null>
  projectFileIds: number[]
  libraryFileIds: number[]
}

export function TimelineStage({ centerPaneRef, projectFileIds, libraryFileIds, ...workspaceProps }: TimelineStageProps) {
  const [targetTrackId, setTargetTrackId] = useState<string | null | undefined>(undefined)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const visual = workspaceProps.visual
  const targetMediaType = targetTrackId
    ? visual?.session.snapshot().document.tracks.find((track) => track.id === targetTrackId)?.media_type
    : undefined
  const availableVisuals = useMemo(() => {
    return (visual?.files || []).filter((file) => (file.media_type === "image" || file.media_type === "video")
      && (!targetMediaType || file.media_type === targetMediaType))
  }, [targetMediaType, visual?.files])
  const usedVisualFileIds = visual?.session.snapshot().document.tracks.flatMap((track) => track.clips.map((clip) => clip.file_id)) || []
  const workspaceVisual = visual ? { ...visual, onAddVisual: (trackId?: string) => setTargetTrackId(trackId || null) } : undefined
  return <main className="ws-center-pane" ref={centerPaneRef}>
    <TimelineWorkspace {...workspaceProps} visual={workspaceVisual} projectFileIds={projectFileIds} />
    {visual && <ProjectLibraryDialog open={targetTrackId !== undefined} files={availableVisuals} projectFileIds={libraryFileIds} usedFileIds={usedVisualFileIds} defaultSource="project" pendingId={pendingId} title={targetMediaType ? `Add ${targetMediaType} to Timeline` : "Add media to Timeline"} description={targetMediaType ? `Choose a ${targetMediaType} from this Project or Workspace Library. It will be placed on this ${targetMediaType === "video" ? "Video" : "Image"} track at the playhead.` : "Choose an image or video from this Project or Workspace Library. A matching track will be used or created at the playhead."} emptyDescription={`Add ${targetMediaType ? `a ${targetMediaType}` : "an image or video"} to the Project Library first.`} addLabel={targetTrackId ? "Add to track" : "Add at playhead"} onOpenChange={(open) => { if (!open) setTargetTrackId(undefined) }} onPreview={setPreviewFile} onAdd={(file) => {
      setPendingId(file.id)
      void visual.session.addVisual(file, workspaceProps.session.snapshot().playhead * 1000, targetTrackId || undefined).then(() => setTargetTrackId(undefined)).finally(() => setPendingId(null))
    }} />}
    <FilePreviewDialog file={previewFile} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />
  </main>
}
