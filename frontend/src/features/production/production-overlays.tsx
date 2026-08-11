import { PartDetailSheet } from "@/components/part-detail-sheet"
import { ProductionToolSheet, type ToolKind } from "@/components/production-tools"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { ClonedVoice, GeneratePayload, GenerateResult, HierarchyNode, PlayerSource, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

export type ConfirmAction = { title: string; description: string; action: () => void }

export default function ProductionOverlays({ tool, projectId, nextPartNumber, insertAt, composerPart, config, clonedVoices, directory, cast, assets, assetCollectionIds, playingKey, playerPlaying, activeDetail, moveOpen, selectedCount, moveTargets, confirmAction, onCloseTool, onSaveDraft, onGenerate, onAddSilence, onInsertAsset, onSetMusic, onUploadAsset, onPlay, onCloseDetail, onDetailChanged, onDuplicate, onDeleteDetail, onNewTake, onMoveOpen, onMoveSelected, onConfirmAction }: {
  tool: ToolKind
  projectId: number
  nextPartNumber: number
  insertAt: number | null
  composerPart: ProductionPart | null
  config: StudioConfig | null
  clonedVoices: ClonedVoice[]
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
  onGenerate: (payload: GeneratePayload) => Promise<GenerateResult>
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
    <ProductionToolSheet open={tool} projectId={projectId} nextPartNumber={nextPartNumber} insertAt={insertAt} part={composerPart} config={config} clonedVoices={clonedVoices} directory={directory} cast={cast} assets={assets} assetCollectionIds={assetCollectionIds} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseTool} onSaveDraft={onSaveDraft} onGenerate={onGenerate} onAddSilence={onAddSilence} onInsertAsset={onInsertAsset} onSetMusic={onSetMusic} onUploadAsset={onUploadAsset} onPlay={onPlay} />
    <PartDetailSheet productionId={projectId} part={activeDetail} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onClose={onCloseDetail} onPlay={onPlay} onChanged={onDetailChanged} onDuplicate={onDuplicate} onDelete={onDeleteDetail} onNewTake={onNewTake} />
    <Sheet open={moveOpen} onOpenChange={onMoveOpen}><SheetContent className="move-sheet"><SheetHeader><SheetTitle>Move {selectedCount} selected part{selectedCount === 1 ? "" : "s"}</SheetTitle><SheetDescription>Choose another Production. The order inside this Production closes up automatically.</SheetDescription></SheetHeader><div className="move-targets">{moveTargets.map((node) => <Button key={node.id} variant="outline" onClick={() => onMoveSelected(node.id, node.name)}><span>{node.name.slice(0, 1).toUpperCase()}</span><b>{node.name}</b></Button>)}</div></SheetContent></Sheet>
    <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open) onConfirmAction(null) }}><DialogContent><DialogHeader><DialogTitle>{confirmAction?.title}</DialogTitle><DialogDescription>{confirmAction?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => onConfirmAction(null)}>Cancel</Button><Button variant="destructive" onClick={() => { const action = confirmAction?.action; onConfirmAction(null); action?.() }}>Delete</Button></DialogFooter></DialogContent></Dialog>
  </>
}
