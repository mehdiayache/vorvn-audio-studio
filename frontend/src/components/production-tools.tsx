import { lazy, Suspense } from "react"

import type { AssetMode, AssetUploadInput, CatalogKeepInput, GeneratedKeepInput } from "@/components/production-tools/asset-tool"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { CatalogKeepResult, GeneratedKeepResult, PlayerSource, VentureAsset } from "@/types/domain"
import type { VoiceDirectory } from "@/types/domain"
import { getVoiceIdentities } from "@/lib/voice-options"
import type { ProductionImportCounts, ProductionImportDocument } from "@/features/production/production-import"

import "@/components/production-tools/production-tools.css"

export type ToolKind = "speech" | "asset" | "silence" | "audio" | "import" | null

const SilenceTool = lazy(() => import("@/components/production-tools/silence-tool").then((module) => ({ default: module.SilenceTool })))
const AssetTool = lazy(() => import("@/components/production-tools/asset-tool").then((module) => ({ default: module.AssetTool })))
const ProductionImportTool = lazy(() => import("@/features/production/production-import-tool").then((module) => ({ default: module.ProductionImportTool })))

export function ProductionToolDialog({ open, productionId, nextPartNumber, beforePartId, replacingAssetId, initialAudioAssetId, assets, assetCollectionIds, directory, playingKey, playerPlaying, onClose, onAddSilence, onInsertAsset, onPlaceAudio, onUploadAsset, onKeepAsset, onKeepGenerated, onImport, onImported, onPlay }: {
  open: Exclude<ToolKind, "speech">
  productionId: number
  nextPartNumber: number
  beforePartId: string | null
  replacingAssetId?: number | null
  initialAudioAssetId?: number | null
  assets: VentureAsset[]
  assetCollectionIds: Record<string, number>
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onClose: () => void
  onAddSilence: (seconds: number) => Promise<void>
  onInsertAsset: (asset: VentureAsset) => Promise<void>
  onPlaceAudio: (asset: VentureAsset) => Promise<void>
  onUploadAsset: (folder: string, input: AssetUploadInput) => Promise<VentureAsset>
  onKeepAsset: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onKeepGenerated: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
  onImport: (document: ProductionImportDocument, roleVoices: Record<string, string>) => Promise<ProductionImportCounts>
  onImported: () => void
  onPlay: (source: PlayerSource) => void
}) {
  const assetMode: AssetMode = open === "audio" ? "sound" : "sequence"
  const replacingAsset = Boolean(replacingAssetId)
  const title = open === "import" ? "Import JSON" : open === "silence" ? "Add silence" : replacingAsset ? "Audio Library · Replace linked audio" : "Audio Library"
  const destination = beforePartId ? "Insert at the selected Sequence position." : `Add as Part ${nextPartNumber}.`
  const description = open === "import" ? "Append authored Speech Drafts and Silence to this existing Production. Validate locally, map roles to owned Voices, then confirm once." : assetMode === "sound" ? "Audition freely. Nothing enters this Audio Track until you confirm." : `${destination} Audition freely; the Sequence changes only after confirmation.`
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "import" ? "import-dialog" : open === "silence" ? "silence-dialog" : "asset-dialog"}`}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={<div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "asset" || open === "audio") && <AssetTool assets={assets} mode={assetMode} productionId={productionId} chooseLabel={replacingAsset ? "Replace linked audio" : undefined} initialSelectedId={assetMode === "sound" ? initialAudioAssetId : replacingAssetId} playingKey={playingKey} playerPlaying={playerPlaying} onChoose={assetMode === "sound" ? onPlaceAudio : onInsertAsset} onUpload={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onUploadAsset(folder, input) }} onKeep={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onKeepAsset(folder, input) }} onKeepGenerated={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onKeepGenerated(folder, input) }} onPlay={onPlay} />}
        {open === "import" && <ProductionImportTool currentPartCount={nextPartNumber - 1} identities={getVoiceIdentities(directory.registry ?? null, directory.identities).filter((identity) => identity.source === "owned")} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onImport={onImport} onImported={onImported} onCancel={onClose} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
