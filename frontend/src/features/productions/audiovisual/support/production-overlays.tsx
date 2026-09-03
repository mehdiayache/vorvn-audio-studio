import { useState } from "react"

import { ProductionToolDialog, type ProductionToolKind } from "@/features/productions/audiovisual/production-tools"
import type { FileUpdateInput, FileUploadInput, CatalogKeepInput } from "@/features/workspace/library/audio-library"
import { ProductionSpeechCreatorDialog } from "@/features/creator/speech/production-speech-creator-host"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import type { ProductionFileResources } from "@/hooks/use-production-resources"
import type { CatalogKeepResult, DurableJob, GeneratePayload, GenerateResult, LoadState, PartEditorialUpdate, PlayerSource, Production, ProductionPart, StudioConfig, WorkspaceFile, VoiceDirectory } from "@/types/domain"

export type ConfirmAction = { title: string; description: string; action: () => void | Promise<void>; confirmLabel?: string; kind?: "confirm" | "delete"; variant?: "default" | "destructive" }

export default function ProductionOverlays({ tool, production, nextPartNumber, insertAt, insertBeforePartId, creatorPart, replacingFileId, initialAudioFileId, config, directory, files, fileState, usedFileIds, playingKey, playerPlaying, confirmAction, onCloseTool, onSaveDraft, onUpdateEditorial, onGenerate, onAddSilence, onInsertFile, onPlaceAudio, onUploadFile, onUpdateFile, onKeepFile, onImported, onPlay, onConfirmAction, onRetryFiles }: {
  tool: ProductionToolKind
  production: Production
  nextPartNumber: number
  insertAt: number | null
  insertBeforePartId: string | null
  creatorPart: ProductionPart | null
  replacingFileId?: number | null
  initialAudioFileId?: number | null
  config: StudioConfig | null
  directory: VoiceDirectory
  files: WorkspaceFile[]
  fileState: LoadState<ProductionFileResources>
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
  onImported: () => void
  onPlay: (source: PlayerSource) => void
  onConfirmAction: (action: ConfirmAction | null) => void
  onRetryFiles: () => Promise<void>
}) {
  const productionId = production.id
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
    {tool === "speech" && <ProductionSpeechCreatorDialog
      title={creatorPart ? `Edit ${formatAuthoredRole(creatorPart.authored_role) || "speech"} · Part ${formatPartNumber(creatorPart.position ?? 0)}` : "Add speech"}
      description={creatorPart?.clip_id ? "Change the words, Voice or delivery, then generate again to replace the current audio." : creatorPart ? "Finish this Draft and generate its first recording." : insertBeforePartId ? "Insert at the selected Script position." : `Add as Part ${nextPartNumber}.`}
      context={{ workspace_id: production.workspace_id, folder_id: production.folder_id, production_id: productionId, production_type: "audiovisual", selection: { capability: "speech", target: "script_part" } }}
      nextPartNumber={nextPartNumber}
      insertAt={insertAt}
      insertBeforePartId={insertBeforePartId}
      part={creatorPart}
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
    <ProductionToolDialog open={tool === "speech" ? null : tool} production={production} config={config} nextPartNumber={nextPartNumber} beforePartId={insertBeforePartId} replacingFileId={replacingFileId} initialAudioFileId={initialAudioFileId} files={files} fileState={fileState} usedFileIds={usedFileIds} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseTool} onAddSilence={onAddSilence} onInsertFile={onInsertFile} onPlaceAudio={onPlaceAudio} onUploadFile={onUploadFile} onUpdateFile={onUpdateFile} onKeepFile={onKeepFile} onImported={onImported} onPlay={onPlay} onRetryFiles={onRetryFiles} />
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
