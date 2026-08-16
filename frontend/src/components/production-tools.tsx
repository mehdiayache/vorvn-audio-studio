import { lazy, Suspense, useEffect, useState } from "react"

import type { AssetMode } from "@/components/production-tools/asset-tool"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PlayerSource, VentureAsset } from "@/types/domain"
import type { VoiceDirectory } from "@/types/domain"
import { getVoiceIdentities } from "@/lib/voice-options"
import type { ProductionImportCounts, ProductionImportDocument } from "@/features/production/production-import"

import "@/components/production-tools/production-tools.css"

export type ToolKind = "speech" | "asset" | "silence" | "music" | "import" | null

const SilenceTool = lazy(() => import("@/components/production-tools/silence-tool").then((module) => ({ default: module.SilenceTool })))
const AssetTool = lazy(() => import("@/components/production-tools/asset-tool").then((module) => ({ default: module.AssetTool })))
const ProductionImportTool = lazy(() => import("@/features/production/production-import-tool").then((module) => ({ default: module.ProductionImportTool })))

export function ProductionToolDialog({ open, nextPartNumber, beforePartId, replacingAssetId, initialMusicAssetId, assets, assetCollectionIds, directory, playingKey, playerPlaying, onClose, onAddSilence, onInsertAsset, onSetMusic, onUploadAsset, onImport, onImported, onPlay }: {
  open: Exclude<ToolKind, "speech">
  nextPartNumber: number
  beforePartId: string | null
  replacingAssetId?: number | null
  initialMusicAssetId?: number | null
  assets: VentureAsset[]
  assetCollectionIds: Record<string, number>
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onClose: () => void
  onAddSilence: (seconds: number) => Promise<void>
  onInsertAsset: (asset: VentureAsset) => Promise<void>
  onSetMusic: (asset: VentureAsset) => Promise<void>
  onUploadAsset: (folder: string, file: File) => Promise<void>
  onImport: (document: ProductionImportDocument, roleVoices: Record<string, string>) => Promise<ProductionImportCounts>
  onImported: () => void
  onPlay: (source: PlayerSource) => void
}) {
  const [assetMode, setAssetMode] = useState<AssetMode>("sequence")
  useEffect(() => { if (open === "music") setAssetMode("music"); if (open === "asset") setAssetMode("sequence") }, [open])
  const replacingAsset = Boolean(replacingAssetId)
  const title = open === "import" ? "Import JSON" : open === "silence" ? "Add silence" : assetMode === "music" ? "Asset Explorer · Music Bed" : replacingAsset ? "Asset Explorer · Replace Venture audio" : "Asset Explorer · Sequence audio"
  const destination = beforePartId ? "Insert at the selected Sequence position." : `Add as Part ${nextPartNumber}.`
  const description = open === "import" ? "Append authored Speech Drafts and Silence to this existing Production. Validate locally, map roles to owned Voices, then confirm once." : open === "music" || assetMode === "music" ? "Search, audition, upload, then explicitly choose one reusable Venture asset for the parallel Music lane." : `${destination} Auditioning is separate from inserting; the following Parts move down only after confirmation.`
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "import" ? "import-dialog" : open === "silence" ? "silence-dialog" : "asset-dialog"}`}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={<div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "asset" || open === "music") && <AssetTool assets={assets} mode={assetMode} chooseLabel={replacingAsset && assetMode === "sequence" ? "Replace linked asset" : undefined} initialSelectedId={assetMode === "music" ? initialMusicAssetId : replacingAssetId} playingKey={playingKey} playerPlaying={playerPlaying} onMode={setAssetMode} onChoose={assetMode === "music" ? onSetMusic : onInsertAsset} onUpload={async (folder, file) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); await onUploadAsset(folder, file) }} onPlay={onPlay} />}
        {open === "import" && <ProductionImportTool currentPartCount={nextPartNumber - 1} identities={getVoiceIdentities(directory.registry ?? null, directory.identities).filter((identity) => identity.source === "owned")} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onImport={onImport} onImported={onImported} onCancel={onClose} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
