import { CheckCircle2, Film, Image as ImageIcon, Library, PanelLeftClose, PanelLeftOpen, Plus, Search, Waves, X } from "lucide-react"
import { memo, useMemo, useState, type ReactNode } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { FileSourceIndicator } from "@/components/file-source-indicator"
import { Input } from "@/components/ui/input"
import { SoundMediaIcon } from "@/features/sound-scene/audio-presentation"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import { visualFilePlaybackUrl, visualFilePosterUrl, visualFileUrl } from "@/features/creator/library/visual-file-presentation"
import { createLibraryQuery, libraryFileName, queryLibraryFiles, type LibraryScope, type LibraryTypeFilter } from "@/features/library/library-query"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { cn } from "@/lib/utils"
import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"
import { PreviewPane, type PreviewTarget } from "./timeline-preview"
import type { WorkstationSelection } from "./workstation-selection"
import { WorkstationPaneHeader } from "./workstation-pane-header"

type MediaFilter = Extract<LibraryTypeFilter, "all" | "image" | "video" | "audio">
type ScopeFilter = Extract<LibraryScope, "project" | "workspace">

export const TimelineMediaBrowser = memo(function TimelineMediaBrowser({ files, projectFileIds, usedFileIds, collapsed, onCollapsedChange, selectedFileId, onPreview, onAdd }: {
  files: WorkspaceFile[]
  projectFileIds: number[]
  usedFileIds: number[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  selectedFileId?: number
  onPreview: (file: WorkspaceFile) => void
  onAdd: (file: WorkspaceFile) => Promise<void> | void
}) {
  const [query, setQuery] = useState("")
  const [media, setMedia] = useState<MediaFilter>("all")
  const [scope, setScope] = useState<ScopeFilter>("project")
  const [pendingId, setPendingId] = useState<number | null>(null)
  const projectIds = useMemo(() => new Set(projectFileIds), [projectFileIds])
  const usedIds = useMemo(() => new Set(usedFileIds), [usedFileIds])
  const libraryQuery = useMemo(() => createLibraryQuery({ scope, type: media, search: query }), [media, query, scope])
  const visible = useMemo(() => queryLibraryFiles(files, libraryQuery, { projectFileIds: projectIds, usedFileIds: usedIds }), [files, libraryQuery, projectIds, usedIds])

  if (collapsed) return <aside className="timeline-media-browser is-collapsed" aria-label="Media Browser">
    <OperatorIconButton label="Show Media Browser" detail="Browse Project and Workspace Files without leaving the Timeline." onClick={() => onCollapsedChange(false)}><PanelLeftOpen /></OperatorIconButton>
  </aside>

  return <aside className="timeline-media-browser" aria-label="Media Browser">
    <WorkstationPaneHeader icon={<Library />} title="Media" actions={<OperatorIconButton label="Hide Media Browser" onClick={() => onCollapsedChange(true)}><PanelLeftClose /></OperatorIconButton>} />
    <div className="timeline-media-scope" aria-label="Media scope">
      {(["project", "workspace"] as ScopeFilter[]).map((value) => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{value === "project" ? "This Project" : "Workspace"}</button>)}
    </div>
    <label className="timeline-media-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" /></label>
    <div className="timeline-media-types" aria-label="Media type">
      {(["all", "image", "video", "audio"] as MediaFilter[]).map((value) => <button key={value} aria-pressed={media === value} onClick={() => setMedia(value)}>{value === "all" ? "All" : value}</button>)}
    </div>
    <div className="timeline-media-results">
      {visible.map((file) => {
        const name = libraryFileName(file)
        const selected = file.id === selectedFileId
        return <article key={file.id} className={cn("timeline-media-card", selected && "is-selected")} data-media-type={file.media_type}>
          <button className="timeline-media-card-preview" aria-label={`Preview ${name}`} onClick={() => onPreview(file)}>
            {file.media_type === "image" ? <img src={visualFileUrl(file)} alt="" loading="lazy" decoding="async" />
              : file.media_type === "video" ? <video src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} muted preload="metadata" playsInline />
                : <span className="timeline-media-audio-art"><SoundMediaIcon kind={String(file.category || "audio").toLowerCase() === "sfx" ? "sfx" : String(file.category || "").toLowerCase() === "music" ? "music" : "audio"} /></span>}
            <span className="timeline-media-kind">{file.media_type === "image" ? <ImageIcon /> : file.media_type === "video" ? <Film /> : <Waves />}</span>
            <FileSourceIndicator file={file} className="timeline-media-origin" />
            {usedIds.has(file.id) && <span className="timeline-media-used"><CheckCircle2 /></span>}
          </button>
          <footer><button className="timeline-media-name" title={name} onClick={() => onPreview(file)}>{name}</button><OperatorIconButton label={`Add ${name} at playhead`} busy={pendingId === file.id} busyLabel={`Adding ${name}…`} onClick={async () => { setPendingId(file.id); try { await onAdd(file) } finally { setPendingId(null) } }}><Plus /></OperatorIconButton></footer>
        </article>
      })}
      {!visible.length && <div className="timeline-media-empty"><Library /><b>No matching media</b><small>Change the scope, type or search.</small></div>}
    </div>
  </aside>
})

export function TimelineWorkbench({ selection, previewTarget, files, projectFileIds, usedFileIds, document, hasVisualPlacements, playheadMs, playback, visualSession, soundSession, visualSaving, timelineTransport, browserCollapsed, onBrowserCollapsedChange, inspector, inspectorTitle, onCloseInspector, onPreviewFile, onReturnTimeline, onAddFile }: {
  selection: WorkstationSelection
  previewTarget: PreviewTarget
  files: WorkspaceFile[]
  projectFileIds: number[]
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
  return <div className={cn("timeline-workbench", browserCollapsed && "browser-collapsed", !inspector && "inspector-closed")}>
    <TimelineMediaBrowser files={files} projectFileIds={projectFileIds} usedFileIds={usedFileIds} collapsed={browserCollapsed} onCollapsedChange={onBrowserCollapsedChange} selectedFileId={selectedFileId} onPreview={onPreviewFile} onAdd={onAddFile} />
    <section className="timeline-monitor" aria-label="Preview">
      <PreviewPane target={previewTarget} selection={selection} files={files} document={document} hasVisualPlacements={hasVisualPlacements} playheadMs={playheadMs} playback={playback} visualSession={visualSession} soundSession={soundSession} visualSaving={visualSaving} timelineTransport={timelineTransport} onReturnTimeline={onReturnTimeline} />
    </section>
    {inspector && <aside className="timeline-workbench-inspector" aria-label="Contextual inspector"><WorkstationPaneHeader title={inspectorTitle || "Inspector"} heading actions={onCloseInspector ? <OperatorIconButton label="Close Inspector" onClick={onCloseInspector}><X /></OperatorIconButton> : undefined} /><div>{inspector}</div></aside>}
  </div>
}
