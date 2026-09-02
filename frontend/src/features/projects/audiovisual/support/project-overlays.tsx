import { useState } from "react"

import { ProjectToolDialog, type ProjectToolKind } from "@/features/projects/audiovisual/project-tools"
import type { FileUpdateInput, FileUploadInput, CatalogKeepInput, GeneratedKeepInput } from "@/features/workspace/library/audio-library"
import { ProjectComposerDialog } from "@/features/composer/project-composer-host"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import type { ProjectFileResources } from "@/hooks/use-project-resources"
import type { CatalogKeepResult, DurableJob, GeneratePayload, GenerateResult, GeneratedKeepResult, LoadState, PartEditorialUpdate, PlayerSource, Project, ProjectPart, StudioConfig, WorkspaceFile, VoiceDirectory } from "@/types/domain"

export type ConfirmAction = { title: string; description: string; action: () => void | Promise<void>; confirmLabel?: string; kind?: "confirm" | "delete"; variant?: "default" | "destructive" }

export default function ProjectOverlays({ tool, project, nextPartNumber, insertAt, insertBeforePartId, composerPart, replacingFileId, initialAudioFileId, config, directory, files, fileState, usedFileIds, playingKey, playerPlaying, confirmAction, onCloseTool, onSaveDraft, onUpdateEditorial, onGenerate, onAddSilence, onInsertFile, onPlaceAudio, onUploadFile, onUpdateFile, onKeepFile, onKeepGenerated, onImported, onPlay, onConfirmAction, onRetryFiles }: {
  tool: ProjectToolKind
  project: Project
  nextPartNumber: number
  insertAt: number | null
  insertBeforePartId: string | null
  composerPart: ProjectPart | null
  replacingFileId?: number | null
  initialAudioFileId?: number | null
  config: StudioConfig | null
  directory: VoiceDirectory
  files: WorkspaceFile[]
  fileState: LoadState<ProjectFileResources>
  usedFileIds: number[]
  playingKey?: string
  playerPlaying: boolean
  confirmAction: ConfirmAction | null
  onCloseTool: () => void
  onSaveDraft: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onUpdateEditorial: (values: PartEditorialUpdate) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onAddSilence: (seconds: number) => Promise<void>
  onInsertFile: (file: WorkspaceFile) => Promise<void>
  onPlaceAudio: (file: WorkspaceFile) => Promise<void>
  onUploadFile: (folder: string, input: FileUploadInput) => Promise<WorkspaceFile>
  onUpdateFile: (file: WorkspaceFile, input: FileUpdateInput) => Promise<WorkspaceFile>
  onKeepFile: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onKeepGenerated: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
  onImported: () => void
  onPlay: (source: PlayerSource) => void
  onConfirmAction: (action: ConfirmAction | null) => void
  onRetryFiles: () => Promise<void>
}) {
  const projectId = project.id
  const [confirmBusy, setConfirmBusy] = useState(false)
  const confirm = async () => {
    if (!confirmAction || confirmBusy) return
    setConfirmBusy(true)
    try {
      await confirmAction.action()
      onConfirmAction(null)
    } catch {
      // The originating action owns its human-readable error and retry path.
    } finally {
      setConfirmBusy(false)
    }
  }
  return <>
    {tool === "speech" && <ProjectComposerDialog
      title={composerPart ? `Edit ${formatAuthoredRole(composerPart.authored_role) || "speech"} · Part ${formatPartNumber(composerPart.position ?? 0)}` : "Add speech"}
      description={composerPart?.clip_id ? "Change the words, Voice or delivery, then generate again to replace the current audio." : composerPart ? "Finish this Draft and generate its first recording." : insertBeforePartId ? "Insert at the selected Script position." : `Add as Part ${nextPartNumber}.`}
      projectId={projectId}
      nextPartNumber={nextPartNumber}
      insertAt={insertAt}
      insertBeforePartId={insertBeforePartId}
      part={composerPart}
      config={config}
      directory={directory}
      playingKey={playingKey}
      playerPlaying={playerPlaying}
      onClose={onCloseTool}
      onSave={onSaveDraft}
      onUpdateEditorial={onUpdateEditorial}
      onGenerate={onGenerate}
      onPlay={onPlay}
    />}
    <ProjectToolDialog open={tool === "speech" ? null : tool} project={project} config={config} nextPartNumber={nextPartNumber} beforePartId={insertBeforePartId} replacingFileId={replacingFileId} initialAudioFileId={initialAudioFileId} files={files} fileState={fileState} usedFileIds={usedFileIds} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseTool} onAddSilence={onAddSilence} onInsertFile={onInsertFile} onPlaceAudio={onPlaceAudio} onUploadFile={onUploadFile} onUpdateFile={onUpdateFile} onKeepFile={onKeepFile} onKeepGenerated={onKeepGenerated} onImported={onImported} onPlay={onPlay} onRetryFiles={onRetryFiles} />
    {confirmAction?.kind === "delete" ? <DeleteConfirmationDialog
      open
      onOpenChange={(open) => { if (!open && !confirmBusy) onConfirmAction(null) }}
      title={confirmAction.title}
      description={confirmAction.description}
      confirmLabel={confirmAction.confirmLabel || "Delete permanently"}
      busy={confirmBusy}
      onConfirm={() => void confirm()}
    /> : <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open && !confirmBusy) onConfirmAction(null) }}><DialogContent><DialogHeader><DialogTitle>{confirmAction?.title}</DialogTitle><DialogDescription>{confirmAction?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={confirmBusy} onClick={() => onConfirmAction(null)}>Cancel</Button><ActionButton variant={confirmAction?.variant || "destructive"} busy={confirmBusy} busyLabel="Working…" onClick={() => void confirm()}>{confirmAction?.confirmLabel || "Confirm"}</ActionButton></DialogFooter></DialogContent></Dialog>}
  </>
}
