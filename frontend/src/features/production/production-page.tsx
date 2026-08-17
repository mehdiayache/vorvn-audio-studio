import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ToolKind } from "@/components/production-tools"
import type { PartDetailTab, SequenceActions } from "@/components/sequence-actions"
import { ProductionEditorCanvas } from "@/features/production/production-editor-canvas"
import { DeleteProductionDialog } from "@/components/delete-production-dialog"
import { MovePartPositionDialog } from "@/features/production/move-part-position-dialog"
import type { ConfirmAction } from "@/features/production/production-overlays"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import { useProductionActions } from "@/hooks/use-production-actions"
import { useProductionSpeechJobs } from "@/features/production/use-production-speech-jobs"
import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import { MusicWorkbench } from "@/features/production/music-workbench"
import { ProductionComposerStage } from "@/features/composer/production-composer-host"
import { PartInspectorContent, partInspectorTitle } from "@/features/production/inspector/part-inspector"
import { PartCaptionsDialog } from "@/features/production/part-captions-dialog"
import { productionHealth, ProductionHealthContent } from "@/features/production/production-health-sheet"
import type { ProductionStageMode } from "@/features/production/production-stage"
import { useMediaQuery } from "@/hooks/use-media-query"
import { formatAuthoredRole, formatPartNumber, partDurationMs } from "@/lib/format"
import { studioApi } from "@/lib/api"
import { audioStudioBase } from "@/lib/links"
import { loadPartCaptionTracks, loadProductionCaptionTracks } from "@/lib/production-caption-tracks"
import type { AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, MusicBed, PlayerCaptionTrack, PlayerSource, Production, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

const PART_SECTION_TO_TAB: Record<string, PartDetailTab> = { text: "script", captions: "captions", details: "details" }
const PART_TAB_TO_SECTION: Record<PartDetailTab, string> = { script: "text", captions: "captions", details: "details" }

type ActiveProductionStage =
  | { mode: "part"; part: ProductionPart; tab: PartDetailTab }
  | { mode: "music" | "health" | "mix-export" }

function scrollPartIntoView(id: number) {
  const reveal = () => document.getElementById(`part-${id}`)?.scrollIntoView({ block: "center" })
  reveal()
  window.requestAnimationFrame(reveal)
}

function initialPartStage(production: Production): ActiveProductionStage | null {
  if (typeof window === "undefined") return null
  const params = new URL(window.location.href).searchParams
  const key = params.get("part")
  const part = key ? production.parts.find((item) => item.public_id === key || String(item.id) === key) || null : null
  if (!part) return null
  const requested = PART_SECTION_TO_TAB[params.get("section") || ""] || "script"
  const recorded = ["audio", "speech"].includes(part.kind)
  const tab = !recorded && requested === "captions" ? "script" : requested
  return { mode: "part", part, tab }
}

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
  const navigate = useNavigate()
  const [activeStage, setActiveStage] = useState<ActiveProductionStage | null>(() => initialPartStage(production))
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [tool, setTool] = useState<ToolKind>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [composerPart, setComposerPart] = useState<ProductionPart | null>(null)
  const [replacingAsset, setReplacingAsset] = useState<ProductionPart | null>(null)
  const [movePositionPart, setMovePositionPart] = useState<ProductionPart | null>(null)
  const [captionPart, setCaptionPart] = useState<ProductionPart | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [deleteProductionOpen, setDeleteProductionOpen] = useState(false)
  const stageOrigin = useRef<HTMLElement | null>(null)
  const mobile = useMediaQuery("(max-width: 48rem)")
  const player = useGlobalPlayer()
  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
  const activeSourceParts = useMemo(() => sourceParts.filter((part) => part.enabled !== false), [sourceParts])
  const captionTrackCache = useRef(new Map<string, Promise<PlayerCaptionTrack[]>>())
  useEffect(() => { captionTrackCache.current.clear() }, [production.id, production.parts])
  const preparePlayerSource = useCallback(async (source: PlayerSource): Promise<PlayerSource> => {
    if (source.captionTracks?.length) return source
    let cacheKey = ""
    let load: (() => Promise<PlayerCaptionTrack[]>) | null = null
    if (source.kind === "production") {
      cacheKey = `production:${production.id}`
      load = () => loadProductionCaptionTracks(production.id, activeSourceParts)
    } else if (source.kind === "clip" && source.key.startsWith("part:")) {
      const part = sourceParts.find((item) => item.id === Number(source.key.slice(5)))
      if (part) {
        cacheKey = `part:${part.id}`
        load = () => loadPartCaptionTracks(production.id, part)
      }
    }
    if (!load) return source
    try {
      const existing = captionTrackCache.current.get(cacheKey)
      const request = existing || load()
      captionTrackCache.current.set(cacheKey, request)
      return { ...source, captionTracks: await request }
    } catch {
      captionTrackCache.current.delete(cacheKey)
      return source
    }
  }, [activeSourceParts, production.id, sourceParts])
  const playSource = useCallback(async (source: PlayerSource) => {
    await player.toggleSource(await preparePlayerSource(source))
  }, [player, preparePlayerSource])
  const closeTool = useCallback(() => { setTool(null); setComposerPart(null); setReplacingAsset(null) }, [])
  const actions = useProductionActions({ production, music, player, refresh, refreshAssets, preparePlayerSource })
  const liveJobs = useProductionSpeechJobs(production.parts, refresh)

  const queueRender = useCallback((payload: GeneratePayload) => {
    const target = composerPart
    const operation = target ? actions.recordPendingPart(target, payload)
        : actions.generatePart(payload)
    return operation.then((job) => {
      closeTool()
      void refresh().catch(() => undefined)
      return job
    })
  }, [actions, closeTool, composerPart, refresh])

  const duration = useMemo(() => activeSourceParts.reduce((total, part) => total + partDurationMs(part), 0) / 1000, [activeSourceParts])
  const activeDetail = activeStage?.mode === "part" ? production.parts.find((part) => part.id === activeStage.part.id) || activeStage.part : null
  const activeCaptionPart = captionPart ? production.parts.find((part) => part.id === captionPart.id) || captionPart : null
  const detailTab = activeStage?.mode === "part" ? activeStage.tab : "script"
  const healthOpen = activeStage?.mode === "health"
  const assetCollectionIds = Object.fromEntries(assetCollections.map((collection) => [collection.name, collection.id]))
  const modalTool = tool === "speech" && !mobile ? null : tool
  const modalDetail = mobile ? activeDetail : null
  const overlaysOpen = Boolean(modalTool || modalDetail || confirmAction)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeDetail) {
      url.searchParams.set("part", activeDetail.public_id || String(activeDetail.id))
      url.searchParams.set("section", PART_TAB_TO_SECTION[detailTab])
    } else {
      url.searchParams.delete("part")
      url.searchParams.delete("section")
    }
    window.history.replaceState(window.history.state, "", url)
  }, [activeDetail, detailTab])

  const rememberStageOrigin = useCallback(() => {
    stageOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [])

  const openTool = useCallback((next: Exclude<ToolKind, null>, beforePartId: string | null = null) => {
    rememberStageOrigin()
    setActiveStage(null)
    setCaptionPart(null)
    setInsertBeforePartId(beforePartId)
    setComposerPart(null)
    setReplacingAsset(null)
    setTool(next)
  }, [rememberStageOrigin])
  const openAssetReplacement = useCallback((part: ProductionPart) => {
    rememberStageOrigin(); setActiveStage(null); setCaptionPart(null); setInsertBeforePartId(null); setComposerPart(null); setReplacingAsset(part); setTool("asset")
  }, [rememberStageOrigin])
  const openSpeechComposer = useCallback((part: ProductionPart) => {
    rememberStageOrigin()
    setActiveStage(null); setCaptionPart(null); setInsertBeforePartId(null); setComposerPart(part); setTool("speech")
  }, [rememberStageOrigin])
  const openPart = useCallback((part: ProductionPart, tab: PartDetailTab = "script") => {
    rememberStageOrigin(); closeTool(); setCaptionPart(null); setActiveStage({ mode: "part", part, tab })
  }, [closeTool, rememberStageOrigin])
  const openCaptions = useCallback((part: ProductionPart) => {
    rememberStageOrigin(); closeTool(); setActiveStage(null); setCaptionPart(part)
  }, [closeTool, rememberStageOrigin])
  const openCaptionContext = useCallback((partId: number) => {
    const part = production.parts.find((item) => item.id === partId)
    if (!part || !["audio", "speech"].includes(part.kind)) return
    scrollPartIntoView(part.id)
    openCaptions(part)
  }, [openCaptions, production.parts])
  const openMixExport = useCallback(() => {
    rememberStageOrigin(); closeTool(); setCaptionPart(null); setActiveStage({ mode: "mix-export" })
  }, [closeTool, rememberStageOrigin])
  const openMusicStage = useCallback(() => {
    rememberStageOrigin(); closeTool(); setCaptionPart(null); setActiveStage({ mode: "music" })
  }, [closeTool, rememberStageOrigin])
  const openHealthStage = useCallback((open = true) => {
    if (!open) { setActiveStage((current) => current?.mode === "health" ? null : current); return }
    rememberStageOrigin(); closeTool(); setCaptionPart(null); setActiveStage({ mode: "health" })
  }, [closeTool, rememberStageOrigin])

  const retryJob = useCallback(async (part: ProductionPart, _job: DurableJob<GenerateResult>) => {
    const payload = { ...(part.speech_job?.request || {}), production_id: production.id } as GeneratePayload
    if (!payload.text) return
    if (part.clip_id) return
    await actions.recordPendingPart(part, payload)
    await refresh()
  }, [actions, production.id, refresh])
  const confirmJob = useCallback(async (_part: ProductionPart, job: DurableJob<GenerateResult>) => {
    await studioApi.confirmJob<GenerateResult>(job.id)
    await refresh()
  }, [refresh])
  const locate = useCallback(scrollPartIntoView, [])
  const closeTransientUi = useCallback(() => {
    setExplorerOpen(false)
    setCommandsOpen(false)
    setActiveStage(null)
    setCaptionPart(null)
    closeTool()
  }, [closeTool])
  const openCommands = useCallback(() => setCommandsOpen(true), [])
  usePlayerShortcuts({ hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek }, closeTransientUi, openCommands)

  const stageMode: ProductionStageMode | null = mobile ? null : tool === "speech" ? "composer" : activeStage?.mode || null
  const composerInsertAt = insertBeforePartId ? Math.max(0, sourceParts.findIndex((part) => part.public_id === insertBeforePartId)) : null
  const healthIssues = useMemo(() => productionHealth(production.parts), [production.parts])
  const composerTitle = composerPart ? `Edit ${formatAuthoredRole(composerPart.authored_role) || "speech"} · Part ${formatPartNumber(composerPart.position ?? 0)}` : "Add speech"
  const composerDescription = composerPart?.clip_id ? "Change the words, Voice or delivery, then replace the current recording." : composerPart ? "Finish this Draft and create its first recording." : insertBeforePartId ? "Insert at the selected Sequence position." : `Add as Part ${sourceParts.length + 1}.`
  const stageTitle = stageMode === "composer" ? composerTitle : stageMode === "part" ? partInspectorTitle(activeDetail) : stageMode === "music" ? "Music Bed" : stageMode === "health" ? "Production health" : stageMode === "mix-export" ? "Mix & Export" : "Production"
  const stageDescription = stageMode === "composer" ? composerDescription : stageMode === "part" && activeDetail ? `Revision ${activeDetail.revision || 1}${activeDetail.clip_id ? " · active recording" : ""}` : stageMode === "music" ? music.filename ? "Parallel mix lane · reusable Venture source" : "Narration only · no Music Bed" : stageMode === "health" ? `${healthIssues.length} current issue${healthIssues.length === 1 ? "" : "s"} · release evidence` : stageMode === "mix-export" ? "Preview the current mix and create immutable output." : undefined
  const previewPlayingPartId = useMemo(() => {
    if (!actions.productionPlaying) return null
    const position = player.currentTime * 1000
    let elapsed = 0
    for (const part of activeSourceParts) {
      elapsed += partDurationMs(part)
      if (position < elapsed) return part.id
    }
    return activeSourceParts.at(-1)?.id || null
  }, [actions.productionPlaying, activeSourceParts, player.currentTime])
  const closeStage = useCallback(() => {
    if (tool === "speech") closeTool()
    else setActiveStage(null)
    const origin = stageOrigin.current
    window.requestAnimationFrame(() => origin?.focus())
  }, [closeTool, tool])
  const closeCaptions = useCallback(() => {
    setCaptionPart(null)
    const origin = stageOrigin.current
    window.requestAnimationFrame(() => origin?.focus())
  }, [])
  const captionChanged = useCallback(async () => {
    if (activeCaptionPart && player.source?.key === `part:${activeCaptionPart.id}`) player.pause()
    actions.invalidatePreview()
    await refresh()
  }, [actions, activeCaptionPart, player, refresh])
  const requestPartDeletion = useCallback((part: ProductionPart) => {
    setConfirmAction({
      title: "Delete this Part permanently?",
      description: "This permanently removes the entire card, including its text, recording and captions. Provider charges already incurred remain in Spend and Activity. Reusable Venture audio remains in its library.",
      confirmLabel: "Delete Part permanently",
      action: () => {
        if (player.source?.key === `part:${part.id}`) player.pause()
        setActiveStage(null)
        void actions.deletePart(part)
      },
    })
  }, [actions, player])

  const stageContent = stageMode === "composer" ? <ProductionComposerStage
    productionId={production.id}
    nextPartNumber={sourceParts.length + 1}
    insertAt={composerInsertAt}
    insertBeforePartId={insertBeforePartId}
    part={composerPart}
    config={config}
    directory={directory}
    playingKey={player.source?.key}
    playerPlaying={actions.playerPlaying}
    onSave={async (payload) => { await actions.saveDraft(payload); closeTool() }}
    onUpdateEditorial={async (values) => {
      if (!composerPart) throw new Error("That Part is no longer open.")
      await actions.updatePartEditorial(composerPart, values)
    }}
    onGenerate={queueRender}
    onPlay={(source) => void playSource(source)}
  /> : stageMode === "part" ? <PartInspectorContent
    productionId={production.id}
    part={activeDetail}
    directory={directory}
    playingKey={player.source?.key}
    playerPlaying={actions.playerPlaying}
    onClose={() => setActiveStage(null)}
    onPlay={(source) => void playSource(source)}
    onChanged={async () => {
      if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause()
      actions.invalidatePreview()
      await refresh()
    }}
    onDuplicate={(part) => void actions.duplicatePart(part)}
    onDelete={requestPartDeletion}
    onRecordPart={openSpeechComposer}
    initialTab={detailTab}
    onTabChange={(tab) => setActiveStage((current) => current?.mode === "part" ? { ...current, tab } : current)}
  /> : stageMode === "music" ? <MusicWorkbench music={music} playingKey={player.source?.key} playing={actions.playerPlaying} onPlay={(source) => void playSource(source)} onChange={actions.setMusic} onChoose={() => openTool("music")} onRemove={() => setConfirmAction({ title: "Remove this Music Bed?", description: "The reusable Venture asset remains available. Only its parallel placement in this Production is removed.", action: () => { void actions.setMusic({ music_of: null }).then(() => setActiveStage(null)) } })} /> : stageMode === "health" ? <ProductionHealthContent issues={healthIssues} onLocate={(id) => { setActiveStage(null); locate(id) }} /> : stageMode === "mix-export" ? <MixExportWorkspace production={production} music={music} previewing={actions.previewing} productionPlaying={actions.productionPlaying} previewReady={actions.productionLoaded} previewStale={Boolean(player.source?.kind === "production" && !actions.productionLoaded)} exportJob={actions.exportJob} onPreview={actions.toggleProduction} onExport={() => void actions.exportMp3()} onLocatePart={(id) => { setActiveStage(null); locate(id) }} onOpenHealth={() => openHealthStage(true)} exporting={actions.exporting} /> : null

  const sequenceActions: SequenceActions = useMemo(() => ({
    play: (source) => void playSource(source),
    duplicate: (part) => void actions.duplicatePart(part),
    remove: requestPartDeletion,
    move: actions.movePart,
    moveToPosition: setMovePositionPart,
    editSilence: (part, seconds) => void actions.editSilence(part, seconds),
    setEnabled: (part, enabled) => void actions.setPartEnabled(part, enabled),
    openPart,
    editSpeech: openSpeechComposer,
  }), [actions, openPart, openSpeechComposer, playSource, requestPartDeletion])

  return <>
    <ProductionEditorCanvas
      production={production}
      tree={tree}
      music={music}
      directory={directory}
      liveJobs={liveJobs}
      duration={duration}
      stageMode={stageMode}
      stageTitle={stageTitle}
      stageDescription={stageDescription}
      stageContent={stageContent}
      explorerOpen={explorerOpen}
      healthOpen={healthOpen}
      commandsOpen={commandsOpen}
      activePartId={composerPart?.id || activeDetail?.id}
      playingKey={player.source?.key}
      playerPlaying={actions.playerPlaying}
      previewing={actions.previewing}
      productionPlaying={actions.productionPlaying}
      productionLoaded={actions.productionLoaded}
      productionCurrentTime={actions.productionLoaded ? player.currentTime : 0}
      previewPlayingPartId={previewPlayingPartId}
      onExplorerOpen={setExplorerOpen}
      onMusicOpen={openMusicStage}
      onHealthOpen={openHealthStage}
      onCommandsOpen={setCommandsOpen}
      onTool={openTool}
      onPreview={actions.toggleProduction}
      onOpenMixExport={openMixExport}
      onDeleteProduction={() => setDeleteProductionOpen(true)}
      onCloseStage={closeStage}
      onLocate={locate}
      onSeekProduction={player.seek}
      onPlay={(source) => void playSource(source)}
      onChooseMusic={() => openTool("music")}
      onRetryJob={(part, job) => void retryJob(part, job)}
      onConfirmJob={(part, job) => void confirmJob(part, job)}
      onReplaceAsset={openAssetReplacement}
      onOpenCaptions={openCaptions}
      onOpenCaptionContext={openCaptionContext}
      sequenceActions={sequenceActions}
    />
    <MovePartPositionDialog part={movePositionPart} count={sourceParts.length} onClose={() => setMovePositionPart(null)} onMove={actions.movePartToPosition} />
    <DeleteProductionDialog production={production} open={deleteProductionOpen} onOpenChange={setDeleteProductionOpen} onDeleted={() => { player.pause(); navigate(`${audioStudioBase}/projects/${production.project_id}`) }} />
    <PartCaptionsDialog productionId={production.id} part={activeCaptionPart} directory={directory} onOpenChange={(open) => { if (!open) closeCaptions() }} onChanged={captionChanged} />
    {overlaysOpen && <Suspense fallback={null}>
      <ProductionOverlays
        tool={modalTool}
        productionId={production.id}
        nextPartNumber={sourceParts.length + 1}
        insertAt={composerInsertAt}
        insertBeforePartId={insertBeforePartId}
        composerPart={composerPart}
        replacingAssetId={replacingAsset?.asset_id}
        initialMusicAssetId={music.music_of}
        config={config}
        directory={directory}
        assets={assets}
        assetCollectionIds={assetCollectionIds}
        playingKey={player.source?.key}
        playerPlaying={actions.playerPlaying}
        activeDetail={modalDetail}
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
        onImport={(document, roleVoices) => studioApi.importProduction(
          production.id, document, roleVoices,
        )}
        onImported={() => {
          actions.invalidatePreview()
          void refresh().then(closeTool)
        }}
        onPlay={(source) => void playSource(source)}
        onCloseDetail={() => setActiveStage(null)}
        onDetailChanged={async () => {
          if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause()
          actions.invalidatePreview()
          await refresh()
        }}
        onDuplicate={(part) => void actions.duplicatePart(part)}
        onDeleteDetail={requestPartDeletion}
        onRecordPart={openSpeechComposer}
        onConfirmAction={setConfirmAction}
      />
    </Suspense>}
  </>
}
