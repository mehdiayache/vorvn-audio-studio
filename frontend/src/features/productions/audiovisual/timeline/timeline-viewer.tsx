import type { ReactNode } from "react"
import { StudioPreviewViewer } from "@/components/studio-timeline/studio-preview-viewer"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { VisualSceneMonitor } from "@/features/visual-scene/timeline/visual-scene-monitor"
import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"
export function TimelinePreview({ document, files, playheadMs, playback, selection, session, saving, transport }: {
  document: VisualSceneDocument; files: WorkspaceFile[]; playheadMs: number
  playback: "idle" | "preparing" | "playing"; selection: VisualClipRef | null
  session: VisualSceneSession; saving: boolean; transport: ReactNode
}) {
  return <StudioPreviewViewer canvas={document.canvas} editable={!saving} saving={saving} transport={transport} onCanvasChange={(width, height) => session.setCanvas(width, height)}>
    <VisualSceneMonitor document={document} files={files} playheadMs={playheadMs} playback={playback} selection={selection} session={session} />
  </StudioPreviewViewer>
}
