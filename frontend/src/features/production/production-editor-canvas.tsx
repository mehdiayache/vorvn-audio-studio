import { useState } from "react"
import type { ReactNode } from "react"

import { ProductionHeader } from "@/components/production-header"
import { SequenceWorkspace } from "@/components/sequence-workspace"
import type { SequenceComposerAnchor } from "@/components/sequence-workspace"
import { TimingOverview } from "@/components/timing-overview"
import { ProductionCastStrip } from "@/features/production/production-cast-strip"
import { ProductionCommandMenu } from "@/features/production/production-command-menu"
import { ProductionExplorerSheet } from "@/features/production/production-explorer-sheet"
import { productionHealth, ProductionHealthSheet } from "@/features/production/production-health-sheet"
import { ProductionSequenceToolbar } from "@/features/production/production-sequence-toolbar"
import type { ProductionCanvasView } from "@/features/production/production-sequence-toolbar"
import { ProductionWorkbench } from "@/features/production/production-workbench"
import { ProductionMusicLane } from "@/features/production/production-music-lane"
import type { ProductionWorkbenchMode } from "@/features/production/production-workbench"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import type { ToolKind } from "@/components/production-tools"
import type { DurableJob, GenerateResult, HierarchyNode, MusicBed, PlayerSource, Production, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/features/production/production-workspace.css"

export function ProductionEditorCanvas({ production, tree, music, directory, cast, liveJobs, duration, workbenchMode, workbenchTitle, workbenchDescription, workbenchContent, composerAnchor, explorerOpen, healthOpen, commandsOpen, selected, activePartId, playingKey, playerPlaying, previewing, productionPlaying, productionLoaded, productionCurrentTime, previewPlayingPartId, onExplorerOpen, onCastOpen, onMusicOpen, onHealthOpen, onCommandsOpen, onTool, onSelected, onPreview, onOpenMixExport, onCloseWorkbench, onLocate, onSeekProduction, onPlay, onChooseMusic, onRetryJob, onConfirmJob, onReplaceAsset, onOpenCaptionContext, sequenceActions }: {
  production: Production
  tree: HierarchyNode[] | null
  music: MusicBed
  directory: VoiceDirectory
  cast: ProductionCastRole[]
  liveJobs: Record<string, DurableJob<unknown>>
  duration: number
  workbenchMode: ProductionWorkbenchMode | null
  workbenchTitle: string
  workbenchDescription?: string
  workbenchContent: ReactNode
  composerAnchor?: SequenceComposerAnchor | null
  explorerOpen: boolean
  healthOpen: boolean
  commandsOpen: boolean
  selected: Set<number>
  activePartId?: number | null
  playingKey?: string
  playerPlaying: boolean
  previewing: boolean
  productionPlaying: boolean
  productionLoaded: boolean
  productionCurrentTime: number
  previewPlayingPartId?: number | null
  onExplorerOpen: (open: boolean) => void
  onCastOpen: (open: boolean) => void
  onMusicOpen: () => void
  onHealthOpen: (open: boolean) => void
  onCommandsOpen: (open: boolean) => void
  onTool: (tool: Exclude<ToolKind, null>, beforePartId?: string | null) => void
  onSelected: (selected: Set<number>) => void
  onPreview: () => void
  onOpenMixExport: () => void
  onCloseWorkbench: () => void
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onPlay: (source: PlayerSource) => void
  onChooseMusic: () => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  onOpenCaptionContext: (partId: number) => void
  sequenceActions: SequenceActions
}) {
  const [view, setView] = useState<ProductionCanvasView>("sequence")
  const issues = productionHealth(production.parts)
  const sourceParts = production.parts.filter((part) => part.kind !== "stitch")

  const timing = <TimingOverview parts={production.parts} music={music} previewing={previewing} playingKey={playingKey} productionPlaying={productionPlaying} productionLoaded={productionLoaded} productionCurrentTime={productionCurrentTime} onPreview={onPreview} onLocate={onLocate} onSeekProduction={onSeekProduction} />
  const canvas = <main className="production-main">
    <ProductionCastStrip cast={cast} directory={directory} onManage={() => onCastOpen(true)} />
    {view === "sequence" && <ProductionMusicLane music={music} playingKey={playingKey} playing={playerPlaying} previewReady={productionLoaded} onPlay={onPlay} onAdd={onChooseMusic} onEdit={onMusicOpen} />}
    <ProductionSequenceToolbar view={view} partCount={sourceParts.length} duration={duration} onViewChange={setView} onAdd={() => onTool("speech")} />
    {view === "sequence" ? <SequenceWorkspace parts={production.parts} cast={cast} liveJobs={liveJobs} selected={selected} activePartId={activePartId} playingKey={playingKey} playerPlaying={playerPlaying} previewPlayingPartId={previewPlayingPartId} directory={directory} composerAnchor={composerAnchor} onSelected={onSelected} onInsert={(kind: InsertKind, beforePartId) => onTool(kind, beforePartId)} onRetryJob={onRetryJob} onConfirmJob={onConfirmJob} onReplaceAsset={onReplaceAsset} actions={sequenceActions} /> : timing}
  </main>

  return (
    <div className="production-page">
      <ProductionHeader production={production} duration={duration} mixExportOpen={workbenchMode === "mix-export"} productionPlaying={productionPlaying} issueCount={issues.length} onExplorer={() => onExplorerOpen(true)} onCast={() => onCastOpen(true)} onCommands={() => onCommandsOpen(true)} onHealth={() => onHealthOpen(true)} onPreview={onPreview} onAdd={(kind) => onTool(kind)} onRelease={onOpenMixExport} />
      <ProductionWorkbench mode={workbenchMode} title={workbenchTitle} description={workbenchDescription} onClose={onCloseWorkbench} canvas={canvas} previewStale={Boolean(playingKey?.startsWith("preview:") && !productionLoaded)} onRefreshPreview={onPreview} onOpenCaptionContext={onOpenCaptionContext}>{workbenchContent}</ProductionWorkbench>
      {tree && <ProductionExplorerSheet open={explorerOpen} nodes={tree} activeKey={production.key} onOpenChange={onExplorerOpen} />}
      <ProductionHealthSheet open={healthOpen} issues={issues} onOpenChange={onHealthOpen} onLocate={onLocate} />
      <ProductionCommandMenu open={commandsOpen} parts={production.parts} productionPlaying={productionPlaying} onOpenChange={onCommandsOpen} onAddSpeech={() => onTool("speech")} onAddSilence={() => onTool("silence")} onAddAsset={() => onTool("asset")} onPreview={onPreview} onCast={() => onCastOpen(true)} onRelease={onOpenMixExport} onLocate={onLocate} />
    </div>
  )
}
