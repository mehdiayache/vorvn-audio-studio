import { lazy, Suspense, useEffect } from "react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { AudioLibraryLoadingWorkspace } from "@/components/production-tools/audio-library-loading"
import type { AssetMode, AssetUpdateInput, AssetUploadInput, CatalogKeepInput, GeneratedKeepInput } from "@/components/production-tools/asset-tool"
import { Skeleton } from "@/components/ui/skeleton"
import { TransportStripView } from "@/components/transport-strip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { StudioAssetResources } from "@/hooks/use-studio-resources"
import type { CatalogKeepResult, GeneratedKeepResult, LoadState, PlayerSource, Production, StudioConfig, VentureAsset } from "@/types/domain"
import type { VoiceDirectory } from "@/types/domain"

import "@/components/production-tools/production-tools.css"

export type ToolKind = "speech" | "asset" | "silence" | "audio" | "import" | null

const SilenceTool = lazy(() => import("@/components/production-tools/silence-tool").then((module) => ({ default: module.SilenceTool })))
const AssetTool = lazy(() => import("@/components/production-tools/asset-tool").then((module) => ({ default: module.AssetTool })))
const ProductionImportTool = lazy(() => import("@/features/production/production-import-tool").then((module) => ({ default: module.ProductionImportTool })))

function AudioLibraryToolLoading() {
  return <div className="tool-panel-body asset-tool asset-tool-loading">
    <header className="asset-workspace-toolbar" aria-hidden="true">
      <strong className="asset-workspace-title">Audio Library</strong>
      <div className="asset-loading-tabs"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
      <Skeleton className="asset-loading-search" />
    </header>
    <div className="asset-workspace-shell"><AudioLibraryLoadingWorkspace /></div>
  </div>
}

export function ProductionToolDialog({ open, production, config, nextPartNumber, beforePartId, replacingAssetId, initialAudioAssetId, assets, assetState, usedAssetIds = [], assetCollectionIds, directory, playingKey, playerPlaying, onClose, onAddSilence, onInsertAsset, onPlaceAudio, onUploadAsset, onUpdateAsset, onKeepAsset, onKeepGenerated, onImported, onPlay, onRetryAssets }: {
  open: Exclude<ToolKind, "speech">
  production: Production
  config: StudioConfig | null
  nextPartNumber: number
  beforePartId: string | null
  replacingAssetId?: number | null
  initialAudioAssetId?: number | null
  assets: VentureAsset[]
  assetState: LoadState<StudioAssetResources>
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
  onUpdateAsset: (asset: VentureAsset, input: AssetUpdateInput) => Promise<VentureAsset>
  onKeepAsset: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onKeepGenerated: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
  onImported: () => void
  onPlay: (source: PlayerSource) => void
  onRetryAssets: () => Promise<void>
}) {
  const player = useGlobalPlayer()
  const assetMode: AssetMode = open === "audio" ? "sound" : "sequence"
  const productionId = production.id
  const replacingAsset = Boolean(replacingAssetId)
  const title = open === "import" ? "Import JSON" : open === "silence" ? "Add silence" : replacingAsset ? "Audio Library · Replace linked audio" : "Audio Library"
  const destination = beforePartId ? "Insert at the selected Script position." : `Add as Part ${nextPartNumber}.`
  const description = open === "import" ? "Append authored Speech Drafts and Silence to this existing Production. Validate locally, map roles to owned Voices, then confirm once." : assetMode === "sound" ? "Audition freely. Nothing enters this Audio Track until you confirm." : `${destination} Audition freely; the Script changes only after confirmation.`
  useEffect(() => {
    if (open !== "asset" && open !== "audio") return
    return player.claimTransport("library")
  }, [open, player.claimTransport])
  const libraryTransport = player.source ? <TransportStripView
    variant="library"
    source={player.source}
    state={player.state}
    currentTime={player.currentTime}
    duration={player.duration}
    volume={player.volume}
    speed={player.speed}
    onToggle={() => void player.toggle()}
    onSeek={player.seek}
    onVolume={player.setVolume}
    onSpeed={player.setSpeed}
    onClose={player.close}
  /> : null
  return <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className={`tool-dialog ${open === "import" ? "import-dialog" : open === "silence" ? "silence-dialog" : "asset-dialog"}`}>
      <DialogHeader className={open === "asset" || open === "audio" ? "asset-dialog-a11y-header" : undefined}><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <Suspense fallback={open === "asset" || open === "audio" ? <AudioLibraryToolLoading /> : <div className="tool-panel-body"><span className="eyebrow">Loading tool…</span></div>}>
        {open === "silence" && <SilenceTool onAdd={onAddSilence} />}
        {(open === "asset" || open === "audio") && <AssetTool assets={assets} loading={assetState.status === "loading" && !assetState.data} refreshing={assetState.status === "loading" && Boolean(assetState.data)} resourceError={assetState.status === "error" ? assetState.error : undefined} onRetryResource={onRetryAssets} usedAssetIds={usedAssetIds} mode={assetMode} productionId={productionId} chooseLabel={replacingAsset ? "Replace linked audio" : undefined} initialSelectedId={assetMode === "sound" ? initialAudioAssetId : replacingAssetId} playingKey={playingKey} playerPlaying={playerPlaying} transport={libraryTransport} onChoose={assetMode === "sound" ? onPlaceAudio : onInsertAsset} onUpload={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onUploadAsset(folder, input) }} onUpdate={onUpdateAsset} onKeep={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onKeepAsset(folder, input) }} onKeepGenerated={async (folder, input) => { if (!assetCollectionIds[folder]) throw new Error(`${folder} library is unavailable.`); return onKeepGenerated(folder, input) }} onPlay={onPlay} />}
        {open === "import" && <ProductionImportTool existing={{ id: production.id, publicId: production.public_id, name: production.name, description: production.description, partCount: nextPartNumber - 1, parent: production.series_id ? { type: "series", id: production.series_id, name: production.trail.at(-1)?.name || "Series" } : { type: "project", id: Number(production.project_id), name: production.trail.at(-1)?.name || "Project" } }} config={config} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onCompleted={onImported} onCancel={onClose} />}
      </Suspense>
    </DialogContent>
  </Dialog>
}
