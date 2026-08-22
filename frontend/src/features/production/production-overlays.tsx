import { ProductionToolDialog, type ToolKind } from "@/components/production-tools"
import type { AssetUploadInput, CatalogKeepInput } from "@/components/production-tools/asset-tool"
import { ProductionComposerDialog } from "@/features/composer/production-composer-host"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import type { CatalogKeepResult, DurableJob, GeneratePayload, GenerateResult, PartEditorialUpdate, PlayerSource, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"
import type { ProductionImportCounts, ProductionImportDocument } from "@/features/production/production-import"

export type ConfirmAction = { title: string; description: string; action: () => void | Promise<void>; confirmLabel?: string; kind?: "confirm" | "delete"; variant?: "default" | "destructive" }

export default function ProductionOverlays({ tool, productionId, nextPartNumber, insertAt, insertBeforePartId, composerPart, replacingAssetId, initialAudioAssetId, config, directory, assets, assetCollectionIds, playingKey, playerPlaying, confirmAction, onCloseTool, onSaveDraft, onUpdateEditorial, onGenerate, onAddSilence, onInsertAsset, onPlaceAudio, onUploadAsset, onKeepAsset, onImport, onImported, onPlay, onConfirmAction }: {
  tool: ToolKind
  productionId: number
  nextPartNumber: number
  insertAt: number | null
  insertBeforePartId: string | null
  composerPart: ProductionPart | null
  replacingAssetId?: number | null
  initialAudioAssetId?: number | null
  config: StudioConfig | null
  directory: VoiceDirectory
  assets: VentureAsset[]
  assetCollectionIds: Record<string, number>
  playingKey?: string
  playerPlaying: boolean
  confirmAction: ConfirmAction | null
  onCloseTool: () => void
  onSaveDraft: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onUpdateEditorial: (values: PartEditorialUpdate) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onAddSilence: (seconds: number) => Promise<void>
  onInsertAsset: (asset: VentureAsset) => Promise<void>
  onPlaceAudio: (asset: VentureAsset) => Promise<void>
  onUploadAsset: (folder: string, input: AssetUploadInput) => Promise<VentureAsset>
  onKeepAsset: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onImport: (document: ProductionImportDocument, roleVoices: Record<string, string>) => Promise<ProductionImportCounts>
  onImported: () => void
  onPlay: (source: PlayerSource) => void
  onConfirmAction: (action: ConfirmAction | null) => void
}) {
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
    {tool === "speech" && <ProductionComposerDialog
      title={composerPart ? `Edit ${formatAuthoredRole(composerPart.authored_role) || "speech"} · Part ${formatPartNumber(composerPart.position ?? 0)}` : "Add speech"}
      description={composerPart?.clip_id ? "Change the words, Voice or delivery, then generate again to replace the current audio." : composerPart ? "Finish this Draft and generate its first recording." : insertBeforePartId ? "Insert at the selected Sequence position." : `Add as Part ${nextPartNumber}.`}
      productionId={productionId}
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
    <ProductionToolDialog open={tool === "speech" ? null : tool} nextPartNumber={nextPartNumber} beforePartId={insertBeforePartId} replacingAssetId={replacingAssetId} initialAudioAssetId={initialAudioAssetId} assets={assets} assetCollectionIds={assetCollectionIds} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseTool} onAddSilence={onAddSilence} onInsertAsset={onInsertAsset} onPlaceAudio={onPlaceAudio} onUploadAsset={onUploadAsset} onKeepAsset={onKeepAsset} onImport={onImport} onImported={onImported} onPlay={onPlay} />
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
import { useState } from "react"

import { ActionButton } from "@/components/operator-action"
