import { lazy, Suspense, useEffect } from "react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { AudioLibraryLoadingWorkspace } from "@/features/workspace/library/audio-library-loading"
import type { AudioLibraryMode, FileUpdateInput, FileUploadInput, CatalogKeepInput } from "@/features/workspace/library/audio-library"
import { Skeleton } from "@/components/ui/skeleton"
import { TransportStripView } from "@/components/transport-strip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ProjectFileResources } from "@/hooks/use-project-resources"
import type { CatalogKeepResult, LoadState, PlayerSource, Project, StudioConfig, WorkspaceFile } from "@/types/domain"
import type { VoiceDirectory } from "@/types/domain"

import "@/features/workspace/library/audio-library.css"

export type ProjectToolKind = "speech" | "file" | "silence" | "audio" | "import" | null

const SilenceTool = lazy(() => import("@/features/projects/audiovisual/support/add-silence-tool").then((module) => ({ default: module.AddSilenceTool })))
const AudioLibrary = lazy(() => import("@/features/workspace/library/audio-library").then((module) => ({ default: module.AudioLibrary })))
const ProjectImportTool = lazy(() => import("@/features/projects/audiovisual/support/project-import-tool").then((module) => ({ default: module.ProjectImportTool })))

function AudioLibraryToolLoading() {
  return <div className="tool-panel-body file-tool file-tool-loading">
    <header className="file-workspace-toolbar" aria-hidden="true">
      <strong className="file-workspace-title">Audio Library</strong>
      <div className="file-loading-tabs"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      <Skeleton className="file-loading-search" />
    </header>
    <div className="file-workspace-shell"><AudioLibraryLoadingWorkspace /></div>
  </div>
}

export function ProjectToolDialog({ open, project, config, nextPartNumber, beforePartId, replacingFileId, initialAudioFileId, files, fileState, usedFileIds = [], directory, playingKey, playerPlaying, onClose, onAddSilence, onInsertFile, onPlaceAudio, onUploadFile, onUpdateFile, onKeepFile, onImported, onPlay, onRetryFiles }: {
  open: Exclude<ProjectToolKind, "speech">
  project: Project
  config: StudioConfig | null
  nextPartNumber: number
  beforePartId: string | null
  replacingFileId?: number | null
  initialAudioFileId?: number | null
  files: WorkspaceFile[]
  fileState: LoadState<ProjectFileResources>
  usedFileIds?: number[]
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onClose: () => void
  onAddSilence: (seconds: number) => Promise<void>
  onInsertFile: (file: WorkspaceFile) => Promise<void>
  onPlaceAudio: (file: WorkspaceFile) => Promise<void>
  onUploadFile: (folder: string, input: FileUploadInput) => Promise<WorkspaceFile>
  onUpdateFile: (file: WorkspaceFile, input: FileUpdateInput) => Promise<WorkspaceFile>
  onKeepFile: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onImported: () => void
  onPlay: (source: PlayerSource) => void
  onRetryFiles: () => Promise<void>
}) {
  const player = useGlobalPlayer()
  const fileMode: AudioLibraryMode = open === "audio" ? "sound" : "sequence"
  const replacingFile = Boolean(replacingFileId)
  const title = open === "import" ? "Import JSON" : open === "silence" ? "Add silence" : replacingFile ? "Audio Library · Replace linked audio" : "Audio Library"
  const destination = beforePartId ? "Insert at the selected Script position." : `Add as Part ${nextPartNumber}.`
  const description = open === "import" ? "Append authored Speech Drafts and Silence to this existing Project. Validate locally, map roles to owned Voices, then confirm once." : fileMode === "sound" ? "Audition freely. Nothing enters this Audio Track until you confirm." : `${destination} Audition freely; the Script changes only after confirmation.`
  useEffect(() => {
    if (open !== "file" && open !== "audio") return
    return player.claimTransport("library")
  }, [open, player.claimTransport])
  const libraryTransport = player.source ? <TransportStripView
    variant="library"
    source={player.source}
    state={player.state}
    currentTime={player.currentTime}
    duration={player.duration}
    volume={player.volume}
    speed={player.speed}
    onToggle={() => void player.toggle()}
    onSeek={player.seek}
    onVolume={player.setVolume}
    onSpeed={player.setSpeed}
    onClose={player.close}
  /> : null
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "import" ? "import-dialog" : open === "silence" ? "silence-dialog" : "file-dialog"}`}>
      <DialogHeader className={open === "file" || open === "audio" ? "file-dialog-a11y-header" : undefined}><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={open === "file" || open === "audio" ? <AudioLibraryToolLoading /> : <div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "file" || open === "audio") && <AudioLibrary context={{ workspace_id: project.workspace_id, folder_id: project.folder_id, project_id: project.id, project_type: "audiovisual" }} files={files} loading={fileState.status === "loading" && !fileState.data} refreshing={fileState.status === "loading" && Boolean(fileState.data)} resourceError={fileState.status === "error" ? fileState.error : undefined} onRetryResource={onRetryFiles} usedFileIds={usedFileIds} mode={fileMode} chooseLabel={replacingFile ? "Replace linked audio" : undefined} initialSelectedId={fileMode === "sound" ? initialAudioFileId : replacingFileId} playingKey={playingKey} playerPlaying={playerPlaying} transport={libraryTransport} onChoose={fileMode === "sound" ? onPlaceAudio : onInsertFile} onUpload={onUploadFile} onUpdate={onUpdateFile} onKeep={onKeepFile} onPlay={onPlay} />}
        {open === "import" && <ProjectImportTool workspaceId={project.workspace_id} folderId={project.folder_id} existing={{ id: project.id, publicId: project.public_id, name: project.name, description: project.description, partCount: nextPartNumber - 1 }} config={config} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onCompleted={onImported} onCancel={onClose} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
