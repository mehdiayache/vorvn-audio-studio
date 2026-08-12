import { ProductionHeader } from "@/components/production-header"
import { ReleaseWorkspace } from "@/components/release-workspace"
import { SequenceWorkspace } from "@/components/sequence-workspace"
import { TimingOverview } from "@/components/timing-overview"
import { CastManagerSheet } from "@/features/production/cast-manager-sheet"
import { ProductionCastStrip } from "@/features/production/production-cast-strip"
import { ProductionCommandMenu } from "@/features/production/production-command-menu"
import { ProductionExplorerSheet } from "@/features/production/production-explorer-sheet"
import { productionHealth, ProductionHealthSheet } from "@/features/production/production-health-sheet"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import type { ToolKind } from "@/components/production-tools"
import type { DurableJob, GenerateResult, HierarchyNode, MusicBed, PlayerSource, Production, ProductionCastRole, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/features/production/production-workspace.css"

export function ProductionEditorCanvas({ production, tree, music, directory, cast, liveJobs, duration, releaseOpen, composerOpen, explorerOpen, castOpen, healthOpen, commandsOpen, selected, playingKey, playerPlaying, previewing, productionPlaying, productionLoaded, productionCurrentTime, exporting, onReleaseOpen, onExplorerOpen, onCastOpen, onHealthOpen, onCommandsOpen, onCastChanged, onTool, onSelected, onPreview, onLocate, onSeekProduction, onPlay, onMusicChange, onChooseMusic, onExport, onRetryJob, onConfirmJob, onReplaceAsset, sequenceActions }: {
  production: Production
  tree: HierarchyNode[] | null
  music: MusicBed
  directory: VoiceDirectory
  cast: ProductionCastRole[]
  liveJobs: Record<string, DurableJob<GenerateResult>>
  duration: number
  releaseOpen: boolean
  composerOpen: boolean
  explorerOpen: boolean
  castOpen: boolean
  healthOpen: boolean
  commandsOpen: boolean
  selected: Set<number>
  playingKey?: string
  playerPlaying: boolean
  previewing: boolean
  productionPlaying: boolean
  productionLoaded: boolean
  productionCurrentTime: number
  exporting: boolean
  onReleaseOpen: (open: boolean) => void
  onExplorerOpen: (open: boolean) => void
  onCastOpen: (open: boolean) => void
  onHealthOpen: (open: boolean) => void
  onCommandsOpen: (open: boolean) => void
  onCastChanged: () => Promise<void>
  onTool: (tool: Exclude<ToolKind, null>, beforePartId?: string | null) => void
  onSelected: (selected: Set<number>) => void
  onPreview: () => void
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onPlay: (source: PlayerSource) => void
  onMusicChange: (changes: Partial<MusicBed>) => Promise<void>
  onChooseMusic: () => void
  onExport: () => void
  onRetryJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onConfirmJob: (part: ProductionPart, job: DurableJob<GenerateResult>) => void
  onReplaceAsset: (part: ProductionPart) => void
  sequenceActions: SequenceActions
}) {
  const issues = productionHealth(production.parts)
  return (
    <div className={`production-page${composerOpen ? " has-studio-dock" : ""}`}>
      <ProductionHeader production={production} duration={duration} releaseOpen={releaseOpen} productionPlaying={productionPlaying} issueCount={issues.length} onExplorer={() => onExplorerOpen(true)} onCast={() => onCastOpen(true)} onCommands={() => onCommandsOpen(true)} onHealth={() => onHealthOpen(true)} onPreview={onPreview} onAdd={(kind) => onTool(kind)} onRelease={() => onReleaseOpen(true)} onBack={() => onReleaseOpen(false)} />
      {!releaseOpen && <main className="production-main">
        <ProductionCastStrip cast={cast} directory={directory} onManage={() => onCastOpen(true)} />
        <details className="production-preview-section"><summary>Preview, timing &amp; music <span>{productionLoaded ? "Preview ready" : music.filename ? "Music attached" : "Narration only"}</span></summary><TimingOverview parts={production.parts} music={music} previewing={previewing} playingKey={playingKey} playing={playerPlaying} productionPlaying={productionPlaying} productionLoaded={productionLoaded} productionCurrentTime={productionCurrentTime} onPreview={onPreview} onLocate={onLocate} onSeekProduction={onSeekProduction} onPlay={onPlay} onMusicChange={onMusicChange} onChooseMusic={onChooseMusic} /></details>
        <SequenceWorkspace parts={production.parts} liveJobs={liveJobs} selected={selected} playingKey={playingKey} playerPlaying={playerPlaying} directory={directory} onSelected={onSelected} onInsert={(kind: InsertKind, beforePartId) => onTool(kind, beforePartId)} onRetryJob={onRetryJob} onConfirmJob={onConfirmJob} onReplaceAsset={onReplaceAsset} actions={sequenceActions} />
      </main>}
      {releaseOpen && <main className="production-main"><ReleaseWorkspace production={production} music={music} previewing={previewing} productionPlaying={productionPlaying} onPreview={onPreview} onExport={onExport} exporting={exporting} /></main>}
      {tree && <ProductionExplorerSheet open={explorerOpen} nodes={tree} activeKey={production.key} onOpenChange={onExplorerOpen} />}
      <CastManagerSheet open={castOpen} production={production} cast={cast} directory={directory} onOpenChange={onCastOpen} onChanged={onCastChanged} />
      <ProductionHealthSheet open={healthOpen} issues={issues} onOpenChange={onHealthOpen} onLocate={onLocate} />
      <ProductionCommandMenu open={commandsOpen} parts={production.parts} productionPlaying={productionPlaying} onOpenChange={onCommandsOpen} onAddSpeech={() => onTool("speech")} onAddSilence={() => onTool("silence")} onAddAsset={() => onTool("asset")} onPreview={onPreview} onCast={() => onCastOpen(true)} onRelease={() => onReleaseOpen(true)} onLocate={onLocate} />
    </div>
  )
}
