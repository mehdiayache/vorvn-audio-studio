import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import type { ContextPanel } from "@/components/context-tool-dock"
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
import type { AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, MusicBed, Production, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"
import { resolveRequestVoice } from "@/lib/voice"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

export function ProductionPage({ production, tree, music, assets, assetCollections, config, directory, refresh, refreshAssets }: {
  production: Production
  tree: HierarchyNode[] | null
  music: MusicBed
  assets: VentureAsset[]
  assetCollections: AssetCollection[]
  config: StudioConfig | null
  directory: VoiceDirectory
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
}) {
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [contextPanel, setContextPanel] = useState<ContextPanel>(null)
  const [tool, setTool] = useState<ToolKind>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [composerPart, setComposerPart] = useState<ProductionPart | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<ProductionPart | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [cast, setCast] = useState<ProductionCastRole[]>([])
  const player = useGlobalPlayer()
  const closeTool = useCallback(() => { setTool(null); setComposerPart(null) }, [])
  const actions = useProductionActions({ production, music, directory, player, refresh, refreshAssets })
  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
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
      : task.mode === "pending" && target ? actions.recordPendingPart(target, task.payload)
      : task.mode === "draft" && target ? actions.renderDraft(target, task.payload)
        : target ? actions.regeneratePart(target, task.payload) : actions.generatePart(task.payload)
  }, [actions, production.parts])
  const renderQueue = useRenderTasks(executeRender, actions.settleRender)

  const queueRender = useCallback((payload: GeneratePayload) => {
    const target = composerPart
    const voice = resolveRequestVoice(payload, directory).name
    const task: RenderTaskDraft = {
      mode: target?.kind === "draft" ? "draft" : target ? "take" : "new",
      payload,
      text: payload.text,
      voice,
      insertAt,
      targetPartId: target?.id,
    }
    return renderQueue.enqueue(task).then((job) => {
      closeTool()
      void refresh()
      return job
    })
  }, [closeTool, composerPart, directory, insertAt, refresh, renderQueue])

  useEffect(() => {
    const visible = new Set(["queued", "running", "retrying", "blocked", "failed", "lost", "cancelled"])
    for (const part of production.parts) {
      const job = part.speech_job
      if (!job || !visible.has(job.status)) continue
      const payload = { ...job.request, production_id: production.id, insert_at: null } as GeneratePayload
      renderQueue.recover({
        id: job.id, jobId: job.id,
        mode: part.selected_take_id ? "take" : "pending",
        status: job.status, payload, text: part.text,
        voice: resolveRequestVoice(payload, directory).name, insertAt: part.position,
        targetPartId: part.id,
        startedAt: job.created_at ? new Date(job.created_at).getTime() : Date.now(),
        error: job.error || undefined, detail: job.detail,
        needsConfirmation: Boolean(job.result?.needs_confirmation),
        requiresReview: Boolean(job.result?.requires_review || job.result?.ambiguous),
        estimate: Number(job.result?.estimate || job.result?.estimated_cost || 0),
      }, job)
    }
  }, [directory, production.id, production.parts, renderQueue.recover])

  const duration = useMemo(() => sourceParts.reduce((total, part) => total + partDurationMs(part), 0) / 1000, [sourceParts])
  const activeDetail = detail ? production.parts.find((part) => part.id === detail.id) || detail : null
  const assetCollectionIds = Object.fromEntries(assetCollections.map((collection) => [collection.name, collection.id]))
  const moveTargets = (tree || []).filter((node) => node.type === "production" && node.id !== production.id)
  const overlaysOpen = Boolean(tool || activeDetail || moveOpen || confirmAction)

  const openTool = useCallback((next: Exclude<ToolKind, null>, at: number | null = null) => {
    setInsertAt(at)
    setInsertBeforePartId(at === null ? null : sourceParts.find(
      (part, index) => (part.position ?? index) >= at)?.public_id || null)
    setComposerPart(null)
    setTool(next)
  }, [sourceParts])
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
    <ProductionEditorCanvas production={production} tree={tree} music={music} directory={directory} cast={cast} renderTasks={renderQueue.tasks} duration={duration} releaseOpen={releaseOpen} composerOpen={tool === "speech"} contextPanel={contextPanel} selected={selected} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} previewing={actions.previewing} productionPlaying={actions.productionPlaying} productionLoaded={actions.productionLoaded} productionCurrentTime={actions.productionLoaded ? player.currentTime : 0} exporting={actions.exporting} onReleaseOpen={setReleaseOpen} onContextPanel={setContextPanel} onTool={openTool} onSelected={setSelected} onPreview={actions.toggleProduction} onLocate={locate} onSeekProduction={player.seek} onPlay={(source) => void player.toggleSource(source)} onMusicChange={actions.setMusic} onChooseMusic={() => openTool("music")} onExport={() => void actions.exportMp3()} onRetryRender={renderQueue.retry} onConfirmRender={(task) => void renderQueue.confirm(task).then(() => refresh()).catch(() => undefined)} onDismissRender={renderQueue.dismiss} sequenceActions={sequenceActions} />
    <ProductionSelectionBar count={selected.size} onSelectAll={() => setSelected(new Set(sourceParts.map((part) => part.id)))} onMove={() => setMoveOpen(true)} onDelete={() => setConfirmAction({ title: `Delete ${selected.size} parts?`, description: "The selected parts and their archived takes will be removed from this Production.", action: () => void actions.deleteParts([...selected]).then(() => setSelected(new Set())) })} onClear={() => setSelected(new Set())} />
    {overlaysOpen && <Suspense fallback={null}><ProductionOverlays tool={tool} productionId={production.id} nextPartNumber={sourceParts.length + 1} insertAt={insertAt} insertBeforePartId={insertBeforePartId} composerPart={composerPart} config={config} directory={directory} cast={cast} assets={assets} assetCollectionIds={assetCollectionIds} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} activeDetail={activeDetail} moveOpen={moveOpen} selectedCount={selected.size} moveTargets={moveTargets} confirmAction={confirmAction} onCloseTool={closeTool} onSaveDraft={async (payload) => { await actions.saveDraft(payload); closeTool() }} onUpdateEditorial={async (values) => { if (!composerPart) throw new Error("That Part is no longer open."); await actions.updatePartEditorial(composerPart, values) }} onGenerate={queueRender} onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertAt); closeTool() }} onInsertAsset={async (asset) => { await actions.insertAsset(asset, insertAt); closeTool() }} onSetMusic={async (asset) => { await actions.setMusicAsset(asset); closeTool() }} onUploadAsset={async (folder, file) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); await actions.uploadAsset(collectionId, folder, file) }} onPlay={(source) => void player.toggleSource(source)} onCloseDetail={() => setDetail(null)} onDetailChanged={async () => { if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause(); actions.invalidatePreview(); await refresh() }} onDuplicate={(part) => void actions.duplicatePart(part)} onDeleteDetail={(part) => setConfirmAction({ title: "Delete this part?", description: "The part and its archived takes will be removed. Generated audio remains recoverable on disk unless explicitly tidied later.", action: () => { setDetail(null); void actions.deletePart(part) } })} onNewTake={openNewTake} onMoveOpen={setMoveOpen} onMoveSelected={(targetId, targetName) => void actions.moveParts([...selected], targetId, targetName).then(() => { setSelected(new Set()); setMoveOpen(false) })} onConfirmAction={setConfirmAction} /></Suspense>}
  </>
}
