import { lazy, Suspense, useEffect, useState } from "react"

import type { AssetMode } from "@/components/production-tools/asset-tool"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PlayerSource, VentureAsset } from "@/types/domain"

import "@/components/production-tools/production-tools.css"

export type ToolKind = "speech" | "asset" | "silence" | "music" | null

const SilenceTool = lazy(() => import("@/components/production-tools/silence-tool").then((module) => ({ default: module.SilenceTool })))
const AssetTool = lazy(() => import("@/components/production-tools/asset-tool").then((module) => ({ default: module.AssetTool })))

export function ProductionToolDialog({ open, nextPartNumber, beforePartId, replacingAsset = false, assets, assetCollectionIds, playingKey, playerPlaying, onClose, onAddSilence, onInsertAsset, onSetMusic, onUploadAsset, onPlay }: {
  open: Exclude<ToolKind, "speech">
  nextPartNumber: number
  beforePartId: string | null
  replacingAsset?: boolean
  assets: VentureAsset[]
  assetCollectionIds: Record<string, number>
  playingKey?: string
  playerPlaying: boolean
  onClose: () => void
  onAddSilence: (seconds: number) => Promise<void>
  onInsertAsset: (asset: VentureAsset) => Promise<void>
  onSetMusic: (asset: VentureAsset) => Promise<void>
  onUploadAsset: (folder: string, file: File) => Promise<void>
  onPlay: (source: PlayerSource) => void
}) {
  const [assetMode, setAssetMode] = useState<AssetMode>("sequence")
  useEffect(() => { if (open === "music") setAssetMode("music"); if (open === "asset") setAssetMode("sequence") }, [open])
  const title = open === "silence" ? "Add silence" : assetMode === "music" ? "Choose music" : replacingAsset ? "Replace Venture audio" : "Choose library audio"
  const destination = beforePartId ? "Insert at the selected Sequence position." : `Add as Part ${nextPartNumber}.`
  const description = open === "music" || assetMode === "music" ? "One bed plays in parallel under the Production." : `${destination} The following Parts move down automatically.`
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "silence" ? "silence-dialog" : "asset-dialog"}`}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={<div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "asset" || open === "music") && <AssetTool assets={assets} mode={assetMode} chooseLabel={replacingAsset && assetMode === "sequence" ? "Replace" : undefined} playingKey={playingKey} playerPlaying={playerPlaying} onMode={setAssetMode} onChoose={assetMode === "music" ? onSetMusic : onInsertAsset} onUpload={async (folder, file) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); await onUploadAsset(folder, file) }} onPlay={onPlay} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
