import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import type { ToolKind } from "@/components/production-tools"
import type { SequenceActions } from "@/components/sequence-actions"
import { ProductionEditorCanvas } from "@/features/production/production-editor-canvas"
import { ProductionSelectionBar } from "@/features/production/production-selection-bar"
import { MovePartPositionDialog } from "@/features/production/move-part-position-dialog"
import type { ConfirmAction } from "@/features/production/production-overlays"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import { useProductionActions } from "@/hooks/use-production-actions"
import { useProductionSpeechJobs } from "@/features/production/use-production-speech-jobs"
import { partDurationMs } from "@/lib/format"
import { studioApi } from "@/lib/api"
import type { AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, MusicBed, Production, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

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
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [castOpen, setCastOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [tool, setTool] = useState<ToolKind>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [composerPart, setComposerPart] = useState<ProductionPart | null>(null)
  const [replacingAsset, setReplacingAsset] = useState<ProductionPart | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<ProductionPart | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [movePositionPart, setMovePositionPart] = useState<ProductionPart | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [cast, setCast] = useState<ProductionCastRole[]>([])
  const player = useGlobalPlayer()
  const closeTool = useCallback(() => { setTool(null); setComposerPart(null); setReplacingAsset(null) }, [])
  const actions = useProductionActions({ production, music, player, refresh, refreshAssets })
  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
  const refreshCast = useCallback(async () => {
    const items = await studioApi.productionCast(production.public_id)
    setCast(items)
  }, [production.public_id])
  useEffect(() => { let active = true; void studioApi.productionCast(production.public_id).then((items) => { if (active) setCast(items) }).catch(() => { if (active) setCast([]) }); return () => { active = false } }, [production.public_id])

  const liveJobs = useProductionSpeechJobs(production.parts, refresh)

  const queueRender = useCallback((payload: GeneratePayload) => {
    const target = composerPart
    const operation = target?.kind === "draft" ? actions.renderDraft(target, payload)
      : target?.selected_take_id ? actions.regeneratePart(target, payload)
        : target ? actions.recordPendingPart(target, payload)
          : actions.generatePart(payload)
    return operation.then((job) => {
      closeTool()
      void refresh().catch(() => undefined)
      return job
    })
  }, [actions, closeTool, composerPart, refresh])

  const duration = useMemo(() => sourceParts.reduce((total, part) => total + partDurationMs(part), 0) / 1000, [sourceParts])
  const activeDetail = detail ? production.parts.find((part) => part.id === detail.id) || detail : null
  const assetCollectionIds = Object.fromEntries(assetCollections.map((collection) => [collection.name, collection.id]))
  const moveTargets = (tree || []).filter((node) => node.type === "production" && node.id !== production.id)
  const overlaysOpen = Boolean(tool || activeDetail || moveOpen || confirmAction)

  const openTool = useCallback((next: Exclude<ToolKind, null>, beforePartId: string | null = null) => {
    setInsertBeforePartId(beforePartId)
    setComposerPart(null)
    setReplacingAsset(null)
    setTool(next)
  }, [])
  const openAssetReplacement = useCallback((part: ProductionPart) => {
    setInsertBeforePartId(null); setComposerPart(null); setReplacingAsset(part); setTool("asset")
  }, [])
  const openNewTake = useCallback((part: ProductionPart) => {
    setDetail(null); setInsertBeforePartId(null); setComposerPart(part); setTool("speech")
  }, [])

  const retryJob = useCallback(async (part: ProductionPart, _job: DurableJob<GenerateResult>) => {
    const payload = { ...(part.speech_job?.request || {}), production_id: production.id } as GeneratePayload
    if (!payload.text) return
    const next = part.kind === "draft" ? actions.renderDraft(part, payload)
      : part.selected_take_id ? actions.regeneratePart(part, payload)
        : actions.recordPendingPart(part, payload)
    await next
    await refresh()
  }, [actions, production.id, refresh])
  const confirmJob = useCallback(async (_part: ProductionPart, job: DurableJob<GenerateResult>) => {
    await studioApi.confirmJob<GenerateResult>(job.id)
    await refresh()
  }, [refresh])
  const locate = useCallback((id: number) => document.getElementById(`part-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), [])
  const closeTransientUi = useCallback(() => {
    setSelected(new Set())
    setMoveOpen(false)
    setExplorerOpen(false)
    setCastOpen(false)
    setHealthOpen(false)
    setCommandsOpen(false)
    setDetail(null)
    closeTool()
  }, [closeTool])
  usePlayerShortcuts({ hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek }, closeTransientUi)

  const sequenceActions: SequenceActions = useMemo(() => ({
    play: (source) => void player.toggleSource(source),
    duplicate: (part) => void actions.duplicatePart(part),
    remove: (part) => setConfirmAction({ title: "Delete this part?", description: "It will be removed from this Production. The reusable Venture source, if any, is not deleted.", action: () => void actions.deletePart(part) }),
    move: actions.movePart,
    moveToPosition: setMovePositionPart,
    editSilence: (part, seconds) => void actions.editSilence(part, seconds),
    openPart: setDetail,
  }), [actions, player])

  return <>
    <ProductionEditorCanvas
      production={production}
      tree={tree}
      music={music}
      directory={directory}
      cast={cast}
      liveJobs={liveJobs}
      duration={duration}
      releaseOpen={releaseOpen}
      composerOpen={tool === "speech"}
      explorerOpen={explorerOpen}
      castOpen={castOpen}
      healthOpen={healthOpen}
      commandsOpen={commandsOpen}
      selected={selected}
      playingKey={player.source?.key}
      playerPlaying={actions.playerPlaying}
      previewing={actions.previewing}
      productionPlaying={actions.productionPlaying}
      productionLoaded={actions.productionLoaded}
      productionCurrentTime={actions.productionLoaded ? player.currentTime : 0}
      exporting={actions.exporting}
      exportJob={actions.exportJob}
      onReleaseOpen={setReleaseOpen}
      onExplorerOpen={setExplorerOpen}
      onCastOpen={setCastOpen}
      onHealthOpen={setHealthOpen}
      onCommandsOpen={setCommandsOpen}
      onCastChanged={async () => { await Promise.all([refreshCast(), refresh()]) }}
      onTool={openTool}
      onSelected={setSelected}
      onPreview={actions.toggleProduction}
      onLocate={locate}
      onSeekProduction={player.seek}
      onPlay={(source) => void player.toggleSource(source)}
      onMusicChange={actions.setMusic}
      onChooseMusic={() => openTool("music")}
      onExport={() => void actions.exportMp3()}
      onRetryJob={(part, job) => void retryJob(part, job)}
      onConfirmJob={(part, job) => void confirmJob(part, job)}
      onReplaceAsset={openAssetReplacement}
      sequenceActions={sequenceActions}
    />
    <ProductionSelectionBar
      count={selected.size}
      onSelectAll={() => setSelected(new Set(sourceParts.map((part) => part.id)))}
      onMove={() => setMoveOpen(true)}
      onDelete={() => setConfirmAction({
        title: `Delete ${selected.size} parts?`,
        description: "The selected parts and their archived takes will be removed from this Production.",
        action: () => void actions.deleteParts([...selected]).then(() => setSelected(new Set())),
      })}
      onClear={() => setSelected(new Set())}
    />
    <MovePartPositionDialog part={movePositionPart} count={sourceParts.length} onClose={() => setMovePositionPart(null)} onMove={actions.movePartToPosition} />
    {overlaysOpen && <Suspense fallback={null}>
      <ProductionOverlays
        tool={tool}
        productionId={production.id}
        nextPartNumber={sourceParts.length + 1}
        insertAt={null}
        insertBeforePartId={insertBeforePartId}
        composerPart={composerPart}
        replacingAsset={Boolean(replacingAsset)}
        config={config}
        directory={directory}
        cast={cast}
        assets={assets}
        assetCollectionIds={assetCollectionIds}
        playingKey={player.source?.key}
        playerPlaying={actions.playerPlaying}
        activeDetail={activeDetail}
        moveOpen={moveOpen}
        selectedCount={selected.size}
        moveTargets={moveTargets}
        confirmAction={confirmAction}
        onCloseTool={closeTool}
        onSaveDraft={async (payload) => { await actions.saveDraft(payload); closeTool() }}
        onUpdateEditorial={async (values) => {
          if (!composerPart) throw new Error("That Part is no longer open.")
          await actions.updatePartEditorial(composerPart, values)
        }}
        onGenerate={queueRender}
        onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertBeforePartId); closeTool() }}
        onInsertAsset={async (asset) => {
          if (replacingAsset) await actions.replaceAsset(replacingAsset, asset)
          else await actions.insertAsset(asset, insertBeforePartId)
          closeTool()
        }}
        onSetMusic={async (asset) => { await actions.setMusicAsset(asset); closeTool() }}
        onUploadAsset={async (folder, file) => {
          const collectionId = assetCollectionIds[folder]
          if (!collectionId) throw new Error(`${folder} library is unavailable.`)
          await actions.uploadAsset(collectionId, folder, file)
        }}
        onPlay={(source) => void player.toggleSource(source)}
        onCloseDetail={() => setDetail(null)}
        onDetailChanged={async () => {
          if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause()
          actions.invalidatePreview()
          await refresh()
        }}
        onDuplicate={(part) => void actions.duplicatePart(part)}
        onDeleteDetail={(part) => setConfirmAction({
          title: "Delete this part?",
          description: "The part and its archived takes will be removed. Generated audio remains recoverable on disk unless explicitly tidied later.",
          action: () => { setDetail(null); void actions.deletePart(part) },
        })}
        onNewTake={openNewTake}
        onMoveOpen={setMoveOpen}
        onMoveSelected={(targetId, targetName) => void actions.moveParts([...selected], targetId, targetName).then(() => {
          setSelected(new Set())
          setMoveOpen(false)
        })}
        onConfirmAction={setConfirmAction}
      />
    </Suspense>}
  </>
}
