import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import type { ContextPanel } from "@/components/context-tool-dock"
import { ProductionPlayer } from "@/components/production-player"
import type { ToolKind } from "@/components/production-tools"
import type { SequenceActions } from "@/components/sequence-actions"
import { ProductionEditorCanvas } from "@/features/production/production-editor-canvas"
import { ProductionSelectionBar } from "@/features/production/production-selection-bar"
import type { ConfirmAction } from "@/features/production/production-overlays"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import { useProductionActions } from "@/hooks/use-production-actions"
import { useRenderTasks, type RenderTaskDraft } from "@/hooks/use-render-tasks"
import { partDurationMs } from "@/lib/format"
import { studioApi } from "@/lib/api"
import type { AssetCollection, ClonedVoice, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, MusicBed, Production, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

export function ProductionPage({ production, tree, music, assets, assetCollections, config, clonedVoices, directory, refresh, refreshAssets }: {
  production: Production
  tree: HierarchyNode[] | null
  music: MusicBed
  assets: VentureAsset[]
  assetCollections: AssetCollection[]
  config: StudioConfig | null
  clonedVoices: ClonedVoice[]
  directory: VoiceDirectory
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
}) {
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [contextPanel, setContextPanel] = useState<ContextPanel>(null)
  const [tool, setTool] = useState<ToolKind>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [composerPart, setComposerPart] = useState<ProductionPart | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<ProductionPart | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [cast, setCast] = useState<ProductionCastRole[]>([])
  const player = useGlobalPlayer()
  const closeTool = useCallback(() => { setTool(null); setComposerPart(null) }, [])
  const actions = useProductionActions({ production, music, directory, player, refresh, refreshAssets })
  useEffect(() => {
    let active = true
    void studioApi.productionCast(production.public_id)
      .then((items) => { if (active) setCast(items) })
      .catch(() => { if (active) setCast([]) })
    return () => { active = false }
  }, [production.public_id])

  const executeRender = useCallback(async (task: RenderTaskDraft): Promise<DurableJob<GenerateResult>> => {
    const target = task.targetPartId ? production.parts.find((part) => part.id === task.targetPartId) : null
    return task.mode === "new" ? actions.generatePart(task.payload)
      : task.mode === "draft" && target ? actions.renderDraft(target, task.payload)
        : target ? actions.regeneratePart(target, task.payload) : actions.generatePart(task.payload)
  }, [actions, production.parts])
  const renderQueue = useRenderTasks(executeRender, async (task, result) => { await actions.settleRender(task, result) })

  const queueRender = useCallback((payload: GeneratePayload) => {
    const target = composerPart
    const task: RenderTaskDraft = {
      mode: target?.kind === "draft" ? "draft" : target ? "take" : "new",
      payload,
      text: payload.text,
      voice: payload.voice,
      insertAt: payload.insert_at,
      targetPartId: target?.id,
    }
    return renderQueue.enqueue(task).then((job) => { closeTool(); return job })
  }, [closeTool, composerPart, renderQueue])

  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
  const duration = useMemo(() => sourceParts.reduce((total, part) => total + partDurationMs(part), 0) / 1000, [sourceParts])
  const activeDetail = detail ? production.parts.find((part) => part.id === detail.id) || detail : null
  const assetCollectionIds = Object.fromEntries(assetCollections.map((collection) => [collection.name, collection.id]))
  const moveTargets = (tree || []).filter((node) => node.type === "production" && node.id !== production.id)
  const overlaysOpen = Boolean(tool || activeDetail || moveOpen || confirmAction)

  const openTool = useCallback((next: Exclude<ToolKind, null>, at: number | null = null) => {
    setInsertAt(at)
    setComposerPart(null)
    setTool(next)
  }, [])
  const openNewTake = useCallback((part: ProductionPart) => {
    setDetail(null); setInsertAt(null); setComposerPart(part); setTool("speech")
  }, [])
  const locate = useCallback((id: number) => document.getElementById(`part-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), [])
  const closeTransientUi = useCallback(() => {
    setSelected(new Set()); setMoveOpen(false); setContextPanel(null); setDetail(null); setTool(null)
  }, [])
  usePlayerShortcuts({ hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek }, closeTransientUi)

  const sequenceActions: SequenceActions = useMemo(() => ({
    play: (source) => void player.toggleSource(source),
    duplicate: (part) => void actions.duplicatePart(part),
    remove: (part) => setConfirmAction({ title: "Delete this part?", description: "It will be removed from this Production. The reusable Venture source, if any, is not deleted.", action: () => void actions.deletePart(part) }),
    move: actions.movePart,
    editSilence: (part, seconds) => void actions.editSilence(part, seconds),
    openPart: setDetail,
  }), [actions, player])

  return <>
    <ProductionEditorCanvas production={production} tree={tree} music={music} directory={directory} cast={cast} renderTasks={renderQueue.tasks} duration={duration} releaseOpen={releaseOpen} contextPanel={contextPanel} selected={selected} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} previewing={actions.previewing} productionPlaying={actions.productionPlaying} productionLoaded={actions.productionLoaded} productionCurrentTime={actions.productionLoaded ? player.currentTime : 0} exporting={actions.exporting} onReleaseOpen={setReleaseOpen} onContextPanel={setContextPanel} onTool={openTool} onSelected={setSelected} onPreview={actions.toggleProduction} onLocate={locate} onSeekProduction={player.seek} onPlay={(source) => void player.toggleSource(source)} onMusicChange={actions.setMusic} onChooseMusic={() => openTool("music")} onExport={() => void actions.exportMp3()} onRetryRender={renderQueue.retry} onDismissRender={renderQueue.dismiss} sequenceActions={sequenceActions} />
    <ProductionSelectionBar count={selected.size} onSelectAll={() => setSelected(new Set(sourceParts.map((part) => part.id)))} onMove={() => setMoveOpen(true)} onDelete={() => setConfirmAction({ title: `Delete ${selected.size} parts?`, description: "The selected parts and their archived takes will be removed from this Production.", action: () => void actions.deleteParts([...selected]).then(() => setSelected(new Set())) })} onClear={() => setSelected(new Set())} />
    <ProductionPlayer source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} volume={player.volume} speed={player.speed} productionTitle={production.name} productionSubtitle={`${sourceParts.length} parts · ${music.filename ? `with ${music.name || "background music"}` : "narration only"}`} productionDuration={duration} previewing={actions.previewing} musicName={music.filename ? music.name || "Music bed" : undefined} compact={overlaysOpen} onToggle={player.toggle} onSeek={player.seek} onVolume={player.setVolume} onSpeed={player.setSpeed} onClose={player.close} onPlayProduction={actions.toggleProduction} onOpenMusic={() => openTool("music")} />
    {overlaysOpen && <Suspense fallback={null}><ProductionOverlays tool={tool} projectId={production.id} nextPartNumber={sourceParts.length + 1} insertAt={insertAt} composerPart={composerPart} config={config} clonedVoices={clonedVoices} directory={directory} cast={cast} assets={assets} assetCollectionIds={assetCollectionIds} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} activeDetail={activeDetail} moveOpen={moveOpen} selectedCount={selected.size} moveTargets={moveTargets} confirmAction={confirmAction} onCloseTool={closeTool} onSaveDraft={async (payload) => { await actions.saveDraft(payload); closeTool() }} onGenerate={queueRender} onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertAt); closeTool() }} onInsertAsset={async (asset) => { await actions.insertAsset(asset, insertAt); closeTool() }} onSetMusic={async (asset) => { await actions.setMusicAsset(asset); closeTool() }} onUploadAsset={async (folder, file) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); await actions.uploadAsset(collectionId, folder, file) }} onPlay={(source) => void player.toggleSource(source)} onCloseDetail={() => setDetail(null)} onDetailChanged={async () => { if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause(); actions.invalidatePreview(); await refresh() }} onDuplicate={(part) => void actions.duplicatePart(part)} onDeleteDetail={(part) => setConfirmAction({ title: "Delete this part?", description: "The part and its archived takes will be removed. Generated audio remains recoverable on disk unless explicitly tidied later.", action: () => { setDetail(null); void actions.deletePart(part) } })} onNewTake={openNewTake} onMoveOpen={setMoveOpen} onMoveSelected={(targetId, targetName) => void actions.moveParts([...selected], targetId, targetName).then(() => { setSelected(new Set()); setMoveOpen(false) })} onConfirmAction={setConfirmAction} /></Suspense>}
  </>
}
