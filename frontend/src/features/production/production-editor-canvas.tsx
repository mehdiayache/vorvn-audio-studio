import { useState } from "react"
import type { ReactNode } from "react"

import { ProductionHeader } from "@/components/production-header"
import { SequenceWorkspace } from "@/components/sequence-workspace"
import { TimingOverview } from "@/components/timing-overview"
import { CastManagerSheet } from "@/features/production/cast-manager-sheet"
import { ProductionCastStrip } from "@/features/production/production-cast-strip"
import { ProductionCommandMenu } from "@/features/production/production-command-menu"
import { ProductionExplorerSheet } from "@/features/production/production-explorer-sheet"
import { productionHealth, ProductionHealthSheet } from "@/features/production/production-health-sheet"
import { ProductionSequenceToolbar } from "@/features/production/production-sequence-toolbar"
import type { ProductionCanvasView } from "@/features/production/production-sequence-toolbar"
import { ProductionWorkbench } from "@/features/production/production-workbench"
import type { ProductionWorkbenchMode } from "@/features/production/production-workbench"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import type { ToolKind } from "@/components/production-tools"
import type { DurableJob, GenerateResult, HierarchyNode, MusicBed, PlayerSource, Production, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/features/production/production-workspace.css"

export function ProductionEditorCanvas({ production, tree, music, directory, cast, liveJobs, duration, workbenchMode, workbenchTitle, workbenchDescription, workbenchContent, explorerOpen, castOpen, healthOpen, commandsOpen, selected, activePartId, playingKey, playerPlaying, previewing, productionPlaying, productionLoaded, productionCurrentTime, onExplorerOpen, onCastOpen, onHealthOpen, onCommandsOpen, onCastChanged, onTool, onSelected, onPreview, onOpenMixExport, onCloseWorkbench, onLocate, onSeekProduction, onPlay, onMusicChange, onChooseMusic, onRetryJob, onConfirmJob, onReplaceAsset, sequenceActions }: {
  production: Production
  tree: HierarchyNode[] | null
  music: MusicBed
  directory: VoiceDirectory
  cast: ProductionCastRole[]
  liveJobs: Record<string, DurableJob<GenerateResult>>
  duration: number
  workbenchMode: ProductionWorkbenchMode | null
  workbenchTitle: string
  workbenchDescription?: string
  workbenchContent: ReactNode
  explorerOpen: boolean
  castOpen: boolean
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
  onExplorerOpen: (open: boolean) => void
  onCastOpen: (open: boolean) => void
  onHealthOpen: (open: boolean) => void
  onCommandsOpen: (open: boolean) => void
  onCastChanged: () => Promise<void>
  onTool: (tool: Exclude<ToolKind, null>, beforePartId?: string | null) => void
  onSelected: (selected: Set<number>) => void
  onPreview: () => void
  onOpenMixExport: () => void
  onCloseWorkbench: () => void
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onPlay: (source: PlayerSource) => void
  onMusicChange: (changes: Partial<MusicBed>) => Promise<void>
  onChooseMusic: () => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  sequenceActions: SequenceActions
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [view, setView] = useState<ProductionCanvasView>("sequence")
  const issues = productionHealth(production.parts)
  const sourceParts = production.parts.filter((part) => part.kind !== "stitch")

  const timing = <TimingOverview parts={production.parts} music={music} previewing={previewing} playingKey={playingKey} playing={playerPlaying} productionPlaying={productionPlaying} productionLoaded={productionLoaded} productionCurrentTime={productionCurrentTime} onPreview={onPreview} onLocate={onLocate} onSeekProduction={onSeekProduction} onPlay={onPlay} onMusicChange={onMusicChange} onChooseMusic={onChooseMusic} />
  const canvas = <main className="production-main">
    <ProductionCastStrip cast={cast} directory={directory} onManage={() => onCastOpen(true)} />
    {view === "sequence" && <details className="production-preview-section production-music-lane" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}><summary><span><b>Music Bed</b><small>{music.filename || "None"}</small></span><span>{productionLoaded ? "Preview ready" : music.filename ? "Music attached" : "Narration only"}</span></summary>{previewOpen && timing}</details>}
    <ProductionSequenceToolbar view={view} partCount={sourceParts.length} duration={duration} onViewChange={setView} onAdd={() => onTool("speech")} />
    {view === "sequence" ? <SequenceWorkspace parts={production.parts} liveJobs={liveJobs} selected={selected} activePartId={activePartId} playingKey={playingKey} playerPlaying={playerPlaying} directory={directory} onSelected={onSelected} onInsert={(kind: InsertKind, beforePartId) => onTool(kind, beforePartId)} onRetryJob={onRetryJob} onConfirmJob={onConfirmJob} onReplaceAsset={onReplaceAsset} actions={sequenceActions} /> : timing}
  </main>

  return (
    <div className="production-page">
      <ProductionHeader production={production} duration={duration} mixExportOpen={workbenchMode === "mix-export"} productionPlaying={productionPlaying} issueCount={issues.length} onExplorer={() => onExplorerOpen(true)} onCast={() => onCastOpen(true)} onCommands={() => onCommandsOpen(true)} onHealth={() => onHealthOpen(true)} onPreview={onPreview} onAdd={(kind) => onTool(kind)} onRelease={onOpenMixExport} />
      <ProductionWorkbench mode={workbenchMode} title={workbenchTitle} description={workbenchDescription} onClose={onCloseWorkbench} canvas={canvas}>{workbenchContent}</ProductionWorkbench>
      {tree && <ProductionExplorerSheet open={explorerOpen} nodes={tree} activeKey={production.key} onOpenChange={onExplorerOpen} />}
      <CastManagerSheet open={castOpen} production={production} cast={cast} directory={directory} onOpenChange={onCastOpen} onChanged={onCastChanged} />
      <ProductionHealthSheet open={healthOpen} issues={issues} onOpenChange={onHealthOpen} onLocate={onLocate} />
      <ProductionCommandMenu open={commandsOpen} parts={production.parts} productionPlaying={productionPlaying} onOpenChange={onCommandsOpen} onAddSpeech={() => onTool("speech")} onAddSilence={() => onTool("silence")} onAddAsset={() => onTool("asset")} onPreview={onPreview} onCast={() => onCastOpen(true)} onRelease={onOpenMixExport} onLocate={onLocate} />
    </div>
  )
}
