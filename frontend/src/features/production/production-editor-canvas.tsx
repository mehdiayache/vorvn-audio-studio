import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { ProductionHeader } from "@/components/production-header"
import { SequenceWorkspace } from "@/components/sequence-workspace"
import { TimingOverview } from "@/components/timing-overview"
import { ProductionCommandMenu } from "@/features/production/production-command-menu"
import { ProductionExplorerSheet } from "@/features/production/production-explorer-sheet"
import { productionHealth, ProductionHealthSheet } from "@/features/production/production-health-sheet"
import { ProductionSequenceToolbar } from "@/features/production/production-sequence-toolbar"
import type { ProductionCanvasView } from "@/features/production/production-sequence-toolbar"
import { activeSequenceFilterCount, EMPTY_SEQUENCE_FILTERS, filterProductionParts, ProductionSequenceSearch } from "@/features/production/production-sequence-search"
import type { SequenceFilters } from "@/features/production/production-sequence-search"
import { ProductionStage } from "@/features/production/production-stage"
import { ProductionMusicLane } from "@/features/production/production-music-lane"
import type { ProductionStageMode } from "@/features/production/production-stage"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import type { ToolKind } from "@/components/production-tools"
import type { DurableJob, GenerateResult, HierarchyNode, MusicBed, PlayerSource, Production, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/features/production/production-workspace.css"

export function ProductionEditorCanvas({ production, view, tree, music, directory, liveJobs, duration, stageMode, stageTitle, stageDescription, stageContent, explorerOpen, healthOpen, commandsOpen, activePartId, playingKey, playerPlaying, previewing, productionPlaying, productionLoaded, productionCurrentTime, previewPlayingPartId, onViewChange, onExplorerOpen, onMusicOpen, onHealthOpen, onCommandsOpen, onTool, onPreview, onOpenMixExport, onDeleteProduction, onCloseStage, onLocate, onSeekProduction, onPlay, onChooseMusic, onRetryJob, onConfirmJob, onReplaceAsset, onOpenCaptions, onOpenCaptionContext, sequenceActions }: {
  production: Production
  view: ProductionCanvasView
  tree: HierarchyNode[] | null
  music: MusicBed
  directory: VoiceDirectory
  liveJobs: Record<string, DurableJob<unknown>>
  duration: number
  stageMode: ProductionStageMode | null
  stageTitle: string
  stageDescription?: string
  stageContent: ReactNode
  explorerOpen: boolean
  healthOpen: boolean
  commandsOpen: boolean
  activePartId?: number | null
  playingKey?: string
  playerPlaying: boolean
  previewing: boolean
  productionPlaying: boolean
  productionLoaded: boolean
  productionCurrentTime: number
  previewPlayingPartId?: number | null
  onViewChange: (view: ProductionCanvasView) => void
  onExplorerOpen: (open: boolean) => void
  onMusicOpen: () => void
  onHealthOpen: (open: boolean) => void
  onCommandsOpen: (open: boolean) => void
  onTool: (tool: Exclude<ToolKind, null>, beforePartId?: string | null) => void
  onPreview: () => void
  onOpenMixExport: () => void
  onDeleteProduction: () => void
  onCloseStage: () => void
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onPlay: (source: PlayerSource) => void
  onChooseMusic: () => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  onOpenCaptions: (part: ProductionPart) => void
  onOpenCaptionContext: (partId: number) => void
  sequenceActions: SequenceActions
}) {
  const [filters, setFilters] = useState<SequenceFilters>(EMPTY_SEQUENCE_FILTERS)
  const [pendingLocateId, setPendingLocateId] = useState<number | null>(null)
  const issues = productionHealth(production.parts)
  const sourceParts = production.parts.filter((part) => part.kind !== "stitch")
  const issuePartIds = useMemo(() => new Set(issues.map((issue) => issue.part.id)), [issues])
  const visibleParts = useMemo(() => filterProductionParts(production.parts, issuePartIds, filters), [filters, issuePartIds, production.parts])
  const filtersActive = activeSequenceFilterCount(filters) > 0
  const revealPart = (id: number) => {
    if (!filtersActive) {
      onLocate(id)
      return
    }
    setPendingLocateId(id)
    setFilters(EMPTY_SEQUENCE_FILTERS)
  }
  useEffect(() => {
    if (pendingLocateId === null || filtersActive) return
    const frame = window.requestAnimationFrame(() => {
      onLocate(pendingLocateId)
      setPendingLocateId(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [filtersActive, onLocate, pendingLocateId])

  const timingOpen = view === "timing"
  const locateFromTiming = (id: number) => {
    onViewChange("sequence")
    window.requestAnimationFrame(() => onLocate(id))
  }
  const canvas = <main className={`production-main${timingOpen ? " has-timing-workspace" : ""}`}>
    <ProductionMusicLane music={music} playingKey={playingKey} playing={playerPlaying} previewReady={productionLoaded} onPlay={onPlay} onAdd={onChooseMusic} onEdit={onMusicOpen} />
    <ProductionSequenceToolbar view={view} partCount={sourceParts.length} visiblePartCount={filtersActive ? visibleParts.length : undefined} duration={duration} navigator={<ProductionSequenceSearch parts={production.parts} issuePartIds={issuePartIds} value={filters} onChange={setFilters} onLocate={revealPart} />} onViewChange={onViewChange} onAdd={(kind) => onTool(kind)} />
    <SequenceWorkspace parts={production.parts} liveJobs={liveJobs} visiblePartIds={filtersActive ? new Set(visibleParts.map((part) => part.id)) : undefined} filtersActive={filtersActive} activePartId={activePartId} playingKey={playingKey} playerPlaying={playerPlaying} previewPlayingPartId={previewPlayingPartId} directory={directory} onClearFilters={() => setFilters(EMPTY_SEQUENCE_FILTERS)} onInsert={(kind: InsertKind, beforePartId) => onTool(kind, beforePartId)} onRetryJob={onRetryJob} onConfirmJob={onConfirmJob} onReplaceAsset={onReplaceAsset} onOpenCaptions={onOpenCaptions} actions={sequenceActions} />
    {timingOpen && <div className="production-timing-dock"><TimingOverview parts={production.parts} music={music} playingKey={playingKey} previewing={previewing} productionLoaded={productionLoaded} productionCurrentTime={productionCurrentTime} onLocate={locateFromTiming} onSeekProduction={onSeekProduction} onClose={() => onViewChange("sequence")} /></div>}
  </main>

  return (
    <div className="production-page">
      <ProductionHeader production={production} duration={duration} mixExportOpen={stageMode === "mix-export"} previewing={previewing} productionPlaying={productionPlaying} issueCount={issues.length} onExplorer={() => onExplorerOpen(true)} onCommands={() => onCommandsOpen(true)} onHealth={() => onHealthOpen(true)} onPreview={onPreview} onAdd={(kind) => onTool(kind)} onRelease={onOpenMixExport} onDelete={onDeleteProduction} />
      <ProductionStage mode={stageMode} title={stageTitle} description={stageDescription} onClose={onCloseStage} canvas={canvas} previewStale={Boolean(playingKey?.startsWith("preview:") && !productionLoaded)} onRefreshPreview={onPreview} onOpenCaptionContext={onOpenCaptionContext}>{stageContent}</ProductionStage>
      {tree && <ProductionExplorerSheet open={explorerOpen} nodes={tree} activeKey={production.key} onOpenChange={onExplorerOpen} />}
      <ProductionHealthSheet open={healthOpen && stageMode !== "health"} issues={issues} onOpenChange={onHealthOpen} onLocate={revealPart} />
      <ProductionCommandMenu open={commandsOpen} parts={production.parts} productionPlaying={productionPlaying} onOpenChange={onCommandsOpen} onAddSpeech={() => onTool("speech")} onAddSilence={() => onTool("silence")} onAddAsset={() => onTool("asset")} onImport={() => onTool("import")} onPreview={onPreview} onRelease={onOpenMixExport} onLocate={revealPart} />
    </div>
  )
}
