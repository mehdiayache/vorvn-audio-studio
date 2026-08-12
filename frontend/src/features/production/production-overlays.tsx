import { PartDetailSheet } from "@/components/part-detail-sheet"
import { ProductionToolDialog, type ToolKind } from "@/components/production-tools"
import { StudioDock } from "@/features/composer/studio-dock"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { DurableJob, GeneratePayload, GenerateResult, HierarchyNode, PlayerSource, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

export type ConfirmAction = { title: string; description: string; action: () => void }

export default function ProductionOverlays({ tool, productionId, nextPartNumber, insertAt, insertBeforePartId, composerPart, replacingAsset, config, directory, cast, assets, assetCollectionIds, playingKey, playerPlaying, activeDetail, moveOpen, selectedCount, moveTargets, confirmAction, onCloseTool, onSaveDraft, onUpdateEditorial, onGenerate, onAddSilence, onInsertAsset, onSetMusic, onUploadAsset, onPlay, onCloseDetail, onDetailChanged, onDuplicate, onDeleteDetail, onNewTake, onMoveOpen, onMoveSelected, onConfirmAction }: {
  tool: ToolKind
  productionId: number
  nextPartNumber: number
  insertAt: number | null
  insertBeforePartId: string | null
  composerPart: ProductionPart | null
  replacingAsset?: boolean
  config: StudioConfig | null
  directory: VoiceDirectory
  cast: ProductionCastRole[]
  assets: VentureAsset[]
  assetCollectionIds: Record<string, number>
  playingKey?: string
  playerPlaying: boolean
  activeDetail: ProductionPart | null
  moveOpen: boolean
  selectedCount: number
  moveTargets: HierarchyNode[]
  confirmAction: ConfirmAction | null
  onCloseTool: () => void
  onSaveDraft: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onUpdateEditorial: (values: { expected_revision: number; script?: string; cast_role_id?: string | null }) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onAddSilence: (seconds: number) => Promise<void>
  onInsertAsset: (asset: VentureAsset) => Promise<void>
  onSetMusic: (asset: VentureAsset) => Promise<void>
  onUploadAsset: (folder: string, file: File) => Promise<void>
  onPlay: (source: PlayerSource) => void
  onCloseDetail: () => void
  onDetailChanged: () => Promise<void>
  onDuplicate: (part: ProductionPart) => void
  onDeleteDetail: (part: ProductionPart) => void
  onNewTake: (part: ProductionPart) => void
  onMoveOpen: (open: boolean) => void
  onMoveSelected: (targetId: number, targetName: string) => void
  onConfirmAction: (action: ConfirmAction | null) => void
}) {
  return <>
    {tool === "speech" && <StudioDock
      title={composerPart ? composerPart.kind === "draft" ? `Record draft · Part ${(composerPart.position ?? 0) + 1}` : `Generate alternative · Part ${(composerPart.position ?? 0) + 1}` : "Add speech"}
      description={composerPart?.kind === "draft" ? "Turn this saved script into its first recording." : composerPart ? "Create another performance without replacing the selected Take." : insertBeforePartId ? "Insert at the selected Sequence position." : `Add as Part ${nextPartNumber}.`}
      productionId={productionId}
      nextPartNumber={nextPartNumber}
      insertAt={insertAt}
      insertBeforePartId={insertBeforePartId}
      part={composerPart}
      config={config}
      directory={directory}
      cast={cast}
      playingKey={playingKey}
      playerPlaying={playerPlaying}
      onClose={onCloseTool}
      onSave={onSaveDraft}
      onUpdateEditorial={onUpdateEditorial}
      onGenerate={onGenerate}
      onPlay={onPlay}
    />}
    <ProductionToolDialog open={tool === "speech" ? null : tool} nextPartNumber={nextPartNumber} beforePartId={insertBeforePartId} replacingAsset={replacingAsset} assets={assets} assetCollectionIds={assetCollectionIds} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseTool} onAddSilence={onAddSilence} onInsertAsset={onInsertAsset} onSetMusic={onSetMusic} onUploadAsset={onUploadAsset} onPlay={onPlay} />
    <PartDetailSheet productionId={productionId} part={activeDetail} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseDetail} onPlay={onPlay} onChanged={onDetailChanged} onDuplicate={onDuplicate} onDelete={onDeleteDetail} onNewTake={onNewTake} />
    <Sheet open={moveOpen} onOpenChange={onMoveOpen}><SheetContent className="move-sheet"><SheetHeader><SheetTitle>Move {selectedCount} selected part{selectedCount === 1 ? "" : "s"}</SheetTitle><SheetDescription>Choose another Production. The order inside this Production closes up automatically.</SheetDescription></SheetHeader><div className="move-targets">{moveTargets.map((node) => <Button key={node.id} variant="outline" onClick={() => onMoveSelected(node.id, node.name)}><span>{node.name.slice(0, 1).toUpperCase()}</span><b>{node.name}</b></Button>)}</div></SheetContent></Sheet>
    <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open) onConfirmAction(null) }}><DialogContent><DialogHeader><DialogTitle>{confirmAction?.title}</DialogTitle><DialogDescription>{confirmAction?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => onConfirmAction(null)}>Cancel</Button><Button variant="destructive" onClick={() => { const action = confirmAction?.action; onConfirmAction(null); action?.() }}>Delete</Button></DialogFooter></DialogContent></Dialog>
  </>
}
