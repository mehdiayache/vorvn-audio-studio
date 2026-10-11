import { X } from "lucide-react"
import { useMemo, type ComponentProps, type ReactNode } from "react"
import { StudioWorkbench } from "@/components/studio-workbench"
import { OperatorIconButton } from "@/components/operator-action"
import { FileSourceIndicator } from "@/components/file-source-indicator"
import { TimelineMediaBrowser as SharedTimelineMediaBrowser } from "@/components/studio-timeline/timeline-media-browser"
import type { WorkspaceFile as StudioFile } from "@/components/studio-timeline/studio-timeline-model"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { visualTimelineFile } from "@/features/visual-scene/timeline/visual-timeline-parts"
import { libraryFileSearchText, libraryFileType } from "@/features/library/library-query"
import { cn } from "@/lib/utils"
import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"
import { PreviewPane, type PreviewTarget } from "./timeline-preview"
import type { WorkstationSelection } from "./workstation-selection"
import { WorkstationPaneHeader } from "./workstation-pane-header"

type TimelineMediaBrowserProps = Omit<ComponentProps<typeof SharedTimelineMediaBrowser>, "files" | "productionFileIds" | "usedFileIds" | "selectedFileId" | "onPreview" | "onAdd" | "renderOrigin"> & {
  files: WorkspaceFile[]
  productionFileIds: number[]
  usedFileIds: number[]
  selectedFileId?: number
  onPreview: (file: WorkspaceFile) => void
  onAdd: (file: WorkspaceFile) => Promise<void> | void
}
/** Keep authorization and the original File identity at the source host boundary. */
export function TimelineMediaBrowser({ files, onPreview, onAdd, ...props }: TimelineMediaBrowserProps) {
  const originals = useMemo(() => new Map(files.map(file => [file.id, file])), [files])
  const descriptors = useMemo(() => files.map(file => ({ ...visualTimelineFile(file), category: file.category ?? undefined, kind: file.kind ?? undefined, source: file.source ?? undefined, tags: file.tags, searchText: libraryFileSearchText(file), libraryType: libraryFileType(file), createdAt: file.created_at || file.updated_at || null })), [files])
  const original = (file: StudioFile) => typeof file.id === "number" ? originals.get(file.id) : undefined
  return <SharedTimelineMediaBrowser {...props} projectLabel="This Production" files={descriptors}
    onPreview={file => { const source = original(file); if (source) onPreview(source) }}
    onAdd={file => { const source = original(file); if (source) return onAdd(source) }}
    renderOrigin={file => { const source = original(file); return source && <FileSourceIndicator file={source} className="timeline-media-origin" /> }} />
}

export function TimelineWorkbench({ selection, previewTarget, files, productionFileIds, usedFileIds, document, hasVisualPlacements, playheadMs, playback, visualSession, soundSession, visualSaving, timelineTransport, browserCollapsed, onBrowserCollapsedChange, inspector, inspectorTitle, onCloseInspector, onPreviewFile, onReturnTimeline, onAddFile }: {
  selection: WorkstationSelection
  previewTarget: PreviewTarget
  files: WorkspaceFile[]
  productionFileIds: number[]
  usedFileIds: number[]
  document: VisualSceneDocument
  hasVisualPlacements: boolean
  playheadMs: number
  playback: "idle" | "preparing" | "playing"
  visualSession?: VisualSceneSession
  soundSession: SoundSceneSession
  visualSaving: boolean
  timelineTransport: ReactNode
  browserCollapsed: boolean
  onBrowserCollapsedChange: (collapsed: boolean) => void
  inspector?: ReactNode
  inspectorTitle?: string
  onCloseInspector?: () => void
  onPreviewFile: (file: WorkspaceFile) => void
  onReturnTimeline: () => void
  onAddFile: (file: WorkspaceFile) => Promise<void> | void
}) {
  const selectedFileId = previewTarget.kind === "source" ? previewTarget.fileId : undefined
  return <StudioWorkbench
    className={cn("timeline-workbench", browserCollapsed && "browser-collapsed", !inspector && "inspector-closed")}
    previewClassName="timeline-monitor"
    inspectorClassName="timeline-workbench-inspector"
    previewLabel="Preview"
    inspectorLabel="Contextual inspector"
    mediaBrowser={<TimelineMediaBrowser files={files} productionFileIds={productionFileIds} usedFileIds={usedFileIds} collapsed={browserCollapsed} onCollapsedChange={onBrowserCollapsedChange} selectedFileId={selectedFileId} onPreview={onPreviewFile} onAdd={onAddFile} />}
    preview={<PreviewPane target={previewTarget} selection={selection} files={files} document={document} hasVisualPlacements={hasVisualPlacements} playheadMs={playheadMs} playback={playback} visualSession={visualSession} soundSession={soundSession} visualSaving={visualSaving} timelineTransport={timelineTransport} onReturnTimeline={onReturnTimeline} />}
    inspector={inspector && <><WorkstationPaneHeader title={inspectorTitle || "Inspector"} heading actions={onCloseInspector ? <OperatorIconButton label="Close Inspector" onClick={onCloseInspector}><X /></OperatorIconButton> : undefined} /><div>{inspector}</div></>}
  />
}
