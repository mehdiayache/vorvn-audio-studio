import { lazy, Suspense, useEffect, useState } from "react"

import type { AssetMode } from "@/components/production-tools/asset-tool"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ClonedVoice, DurableJob, GeneratePayload, GenerateResult, PlayerSource, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

import "@/components/production-tools/production-tools.css"

export type ToolKind = "speech" | "asset" | "silence" | "music" | null

const SpeechTool = lazy(() => import("@/components/production-tools/speech-tool").then((module) => ({ default: module.SpeechTool })))
const SilenceTool = lazy(() => import("@/components/production-tools/silence-tool").then((module) => ({ default: module.SilenceTool })))
const AssetTool = lazy(() => import("@/components/production-tools/asset-tool").then((module) => ({ default: module.AssetTool })))

export function ProductionToolSheet({ open, projectId, nextPartNumber, insertAt, insertBeforePartId, part, config, clonedVoices, directory, cast, assets, assetCollectionIds, playingKey, playerPlaying, onClose, onSaveDraft, onGenerate, onAddSilence, onInsertAsset, onSetMusic, onUploadAsset, onPlay }: {
  open: ToolKind
  projectId: number
  nextPartNumber: number
  insertAt: number | null
  insertBeforePartId: string | null
  part?: ProductionPart | null
  config: StudioConfig | null
  clonedVoices: ClonedVoice[]
  directory: VoiceDirectory
  cast: ProductionCastRole[]
  assets: VentureAsset[]
  assetCollectionIds: Record<string, number>
  playingKey?: string
  playerPlaying: boolean
  onClose: () => void
  onSaveDraft: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onAddSilence: (seconds: number) => Promise<void>
  onInsertAsset: (asset: VentureAsset) => Promise<void>
  onSetMusic: (asset: VentureAsset) => Promise<void>
  onUploadAsset: (folder: string, file: File) => Promise<void>
  onPlay: (source: PlayerSource) => void
}) {
  const [assetMode, setAssetMode] = useState<AssetMode>("sequence")
  useEffect(() => { if (open === "music") setAssetMode("music"); if (open === "asset") setAssetMode("sequence") }, [open])
  const title = open === "speech" ? part ? part.kind === "draft" ? `Record draft · Part ${(part.position ?? 0) + 1}` : `New take · Part ${(part.position ?? 0) + 1}` : "Add speech" : open === "silence" ? "Add silence" : assetMode === "music" ? "Choose music" : "Choose library audio"
  const destination = insertAt === null ? `Add as Part ${nextPartNumber}.` : `Insert as Part ${insertAt + 1}.`
  const description = open === "music" || assetMode === "music" ? "One bed plays in parallel under the Production." : part?.kind === "draft" ? "Turn this saved script into its first recording." : part ? "Create another performance without losing the current take." : `${destination} The following Parts move down automatically.`
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "speech" ? "composer-dialog" : open === "silence" ? "silence-dialog" : "asset-dialog"}`}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={<div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "speech" && <SpeechTool projectId={projectId} nextPartNumber={nextPartNumber} insertAt={insertAt} insertBeforePartId={insertBeforePartId} part={part} config={config} clonedVoices={clonedVoices} directory={directory} cast={cast} playingKey={playingKey} playerPlaying={playerPlaying} onSave={onSaveDraft} onGenerate={onGenerate} onPlay={onPlay} />}
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "asset" || open === "music") && <AssetTool assets={assets} mode={assetMode} playingKey={playingKey} playerPlaying={playerPlaying} onMode={setAssetMode} onChoose={assetMode === "music" ? onSetMusic : onInsertAsset} onUpload={async (folder, file) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); await onUploadAsset(folder, file) }} onPlay={onPlay} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
