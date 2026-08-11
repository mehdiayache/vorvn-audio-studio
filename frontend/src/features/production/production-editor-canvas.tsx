import { ContextToolDock, type ContextPanel } from "@/components/context-tool-dock"
import { ProductionHeader } from "@/components/production-header"
import { ReleaseWorkspace } from "@/components/release-workspace"
import { SequenceWorkspace } from "@/components/sequence-workspace"
import { TimingOverview } from "@/components/timing-overview"
import type { InsertKind, SequenceActions } from "@/components/sequence-actions"
import type { ToolKind } from "@/components/production-tools"
import type { HierarchyNode, MusicBed, PlayerSource, Production, ProductionCastRole, RenderTask, VoiceDirectory } from "@/types/domain"

export function ProductionEditorCanvas({ production, tree, music, directory, cast, renderTasks, duration, releaseOpen, contextPanel, selected, playingKey, playerPlaying, previewing, productionPlaying, productionLoaded, productionCurrentTime, exporting, onReleaseOpen, onContextPanel, onTool, onSelected, onPreview, onLocate, onSeekProduction, onPlay, onMusicChange, onChooseMusic, onExport, onRetryRender, onDismissRender, sequenceActions }: {
  production: Production
  tree: HierarchyNode[] | null
  music: MusicBed
  directory: VoiceDirectory
  cast: ProductionCastRole[]
  renderTasks: RenderTask[]
  duration: number
  releaseOpen: boolean
  contextPanel: ContextPanel
  selected: Set<number>
  playingKey?: string
  playerPlaying: boolean
  previewing: boolean
  productionPlaying: boolean
  productionLoaded: boolean
  productionCurrentTime: number
  exporting: boolean
  onReleaseOpen: (open: boolean) => void
  onContextPanel: (panel: ContextPanel) => void
  onTool: (tool: Exclude<ToolKind, null>, at?: number | null) => void
  onSelected: (selected: Set<number>) => void
  onPreview: () => void
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onPlay: (source: PlayerSource) => void
  onMusicChange: (changes: Partial<MusicBed>) => Promise<void>
  onChooseMusic: () => void
  onExport: () => void
  onRetryRender: (task: RenderTask) => void
  onDismissRender: (id: string) => void
  sequenceActions: SequenceActions
}) {
  return (
    <div className="production-page">
      <ProductionHeader production={production} duration={duration} releaseOpen={releaseOpen} onExplorer={() => onContextPanel("explorer")} onAdd={(kind) => onTool(kind)} onRelease={() => onReleaseOpen(true)} onBack={() => onReleaseOpen(false)} />
      {!releaseOpen && <main className="production-main">
        {tree && <ContextToolDock panel={contextPanel} onPanel={onContextPanel} nodes={tree} activeKey={production.key} parts={production.parts} directory={directory} cast={cast} productionPlaying={productionPlaying} onLocate={onLocate} onOpenTool={onTool} onPreview={onPreview} onRelease={() => onReleaseOpen(true)} />}
        <TimingOverview parts={production.parts} music={music} previewing={previewing} playingKey={playingKey} playing={playerPlaying} productionPlaying={productionPlaying} productionLoaded={productionLoaded} productionCurrentTime={productionCurrentTime} onPreview={onPreview} onLocate={onLocate} onSeekProduction={onSeekProduction} onPlay={onPlay} onMusicChange={onMusicChange} onChooseMusic={onChooseMusic} />
        <SequenceWorkspace parts={production.parts} renderTasks={renderTasks} selected={selected} playingKey={playingKey} playerPlaying={playerPlaying} directory={directory} onSelected={onSelected} onInsert={(kind: InsertKind, at) => onTool(kind, at)} onRetryRender={onRetryRender} onDismissRender={onDismissRender} actions={sequenceActions} />
      </main>}
      {releaseOpen && <main className="production-main"><ReleaseWorkspace production={production} music={music} previewing={previewing} productionPlaying={productionPlaying} onPreview={onPreview} onExport={onExport} exporting={exporting} /></main>}
    </div>
  )
}
