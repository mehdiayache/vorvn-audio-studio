import { lazy, Suspense } from "react"

import type { AssetMode, AssetUploadInput, CatalogKeepInput, GeneratedKeepInput } from "@/components/production-tools/asset-tool"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { CatalogKeepResult, GeneratedKeepResult, PlayerSource, Production, StudioConfig, VentureAsset } from "@/types/domain"
import type { VoiceDirectory } from "@/types/domain"

import "@/components/production-tools/production-tools.css"

export type ToolKind = "speech" | "asset" | "silence" | "audio" | "import" | null

const SilenceTool = lazy(() => import("@/components/production-tools/silence-tool").then((module) => ({ default: module.SilenceTool })))
const AssetTool = lazy(() => import("@/components/production-tools/asset-tool").then((module) => ({ default: module.AssetTool })))
const ProductionImportTool = lazy(() => import("@/features/production/production-import-tool").then((module) => ({ default: module.ProductionImportTool })))

export function ProductionToolDialog({ open, production, config, nextPartNumber, beforePartId, replacingAssetId, initialAudioAssetId, assets, usedAssetIds = [], assetCollectionIds, directory, playingKey, playerPlaying, onClose, onAddSilence, onInsertAsset, onPlaceAudio, onUploadAsset, onKeepAsset, onKeepGenerated, onImported, onPlay }: {
  open: Exclude<ToolKind, "speech">
  production: Production
  config: StudioConfig | null
  nextPartNumber: number
  beforePartId: string | null
  replacingAssetId?: number | null
  initialAudioAssetId?: number | null
  assets: VentureAsset[]
  usedAssetIds?: number[]
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
  onImported: () => void
  onPlay: (source: PlayerSource) => void
}) {
  const assetMode: AssetMode = open === "audio" ? "sound" : "sequence"
  const productionId = production.id
  const replacingAsset = Boolean(replacingAssetId)
  const title = open === "import" ? "Import JSON" : open === "silence" ? "Add silence" : replacingAsset ? "Audio Library · Replace linked audio" : "Audio Library"
  const destination = beforePartId ? "Insert at the selected Script position." : `Add as Part ${nextPartNumber}.`
  const description = open === "import" ? "Append authored Speech Drafts and Silence to this existing Production. Validate locally, map roles to owned Voices, then confirm once." : assetMode === "sound" ? "Audition freely. Nothing enters this Audio Track until you confirm." : `${destination} Audition freely; the Script changes only after confirmation.`
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "import" ? "import-dialog" : open === "silence" ? "silence-dialog" : "asset-dialog"}`}>
      <DialogHeader className={open === "asset" || open === "audio" ? "asset-dialog-a11y-header" : undefined}><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={<div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "asset" || open === "audio") && <AssetTool assets={assets} usedAssetIds={usedAssetIds} mode={assetMode} productionId={productionId} chooseLabel={replacingAsset ? "Replace linked audio" : undefined} initialSelectedId={assetMode === "sound" ? initialAudioAssetId : replacingAssetId} playingKey={playingKey} playerPlaying={playerPlaying} onChoose={assetMode === "sound" ? onPlaceAudio : onInsertAsset} onUpload={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onUploadAsset(folder, input) }} onKeep={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onKeepAsset(folder, input) }} onKeepGenerated={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onKeepGenerated(folder, input) }} onPlay={onPlay} />}
        {open === "import" && <ProductionImportTool existing={{ id: production.id, publicId: production.public_id, name: production.name, description: production.description, partCount: nextPartNumber - 1, parent: production.series_id ? { type: "series", id: production.series_id, name: production.trail.at(-1)?.name || "Series" } : { type: "project", id: Number(production.project_id), name: production.trail.at(-1)?.name || "Project" } }} config={config} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onCompleted={onImported} onCancel={onClose} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
