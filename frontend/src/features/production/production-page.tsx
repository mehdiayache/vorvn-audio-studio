import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ToolKind } from "@/components/production-tools"
import type { PartDetailTab, SequenceActions } from "@/components/sequence-actions"
import { ProductionEditorCanvas } from "@/features/production/production-editor-canvas"
import { ProductionSelectionBar } from "@/features/production/production-selection-bar"
import { MovePartPositionDialog } from "@/features/production/move-part-position-dialog"
import type { ConfirmAction } from "@/features/production/production-overlays"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import { useProductionActions } from "@/hooks/use-production-actions"
import { useProductionSpeechJobs } from "@/features/production/use-production-speech-jobs"
import { ProductionComposerSession } from "@/features/composer/production-composer-host"
import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import { PartInspectorContent, partInspectorTitle } from "@/features/production/inspector/part-inspector"
import type { ProductionWorkbenchMode } from "@/features/production/production-workbench"
import { InlineResourceError } from "@/components/state-panel"
import { useMediaQuery } from "@/hooks/use-media-query"
import { partDurationMs } from "@/lib/format"
import { studioApi } from "@/lib/api"
import { loadPartCaptionTracks, loadProductionCaptionTracks } from "@/lib/production-caption-tracks"
import type { AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, MusicBed, PlayerCaptionTrack, PlayerSource, Production, ProductionCastRole, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory } from "@/types/domain"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

const PART_SECTION_TO_TAB: Record<string, PartDetailTab> = { text: "script", takes: "takes", captions: "captions", details: "details" }
const PART_TAB_TO_SECTION: Record<PartDetailTab, string> = { script: "text", takes: "takes", captions: "captions", details: "details" }

function initialPartWorkbench(production: Production) {
  if (typeof window === "undefined") return { part: null, tab: "script" as PartDetailTab }
  const params = new URL(window.location.href).searchParams
  const key = params.get("part")
  const part = key ? production.parts.find((item) => item.public_id === key || String(item.id) === key) || null : null
  const requested = PART_SECTION_TO_TAB[params.get("section") || ""] || "script"
  const recorded = Boolean(part && ["audio", "speech"].includes(part.kind))
  const tab = !recorded && ["takes", "captions"].includes(requested) ? "script" : requested
  return { part, tab }
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
  const initialWorkbench = initialPartWorkbench(production)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [castOpen, setCastOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [tool, setTool] = useState<ToolKind>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [composerPart, setComposerPart] = useState<ProductionPart | null>(null)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [inlineComposerHost, setInlineComposerHost] = useState<HTMLDivElement | null>(null)
  const [workbenchComposerHost, setWorkbenchComposerHost] = useState<HTMLDivElement | null>(null)
  const [replacingAsset, setReplacingAsset] = useState<ProductionPart | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<ProductionPart | null>(initialWorkbench.part)
  const [detailTab, setDetailTab] = useState<PartDetailTab>(initialWorkbench.tab)
  const [moveOpen, setMoveOpen] = useState(false)
  const [movePositionPart, setMovePositionPart] = useState<ProductionPart | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [cast, setCast] = useState<ProductionCastRole[]>([])
  const [castError, setCastError] = useState("")
  const workbenchOrigin = useRef<HTMLElement | null>(null)
  const canvasScrollPosition = useRef<number | null>(null)
  const mobile = useMediaQuery("(max-width: 48rem)")
  const player = useGlobalPlayer()
  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
  const captionTrackCache = useRef(new Map<string, Promise<PlayerCaptionTrack[]>>())
  useEffect(() => { captionTrackCache.current.clear() }, [production.id, production.parts])
  const preparePlayerSource = useCallback(async (source: PlayerSource): Promise<PlayerSource> => {
    if (source.captionTracks?.length) return source
    let cacheKey = ""
    let load: (() => Promise<PlayerCaptionTrack[]>) | null = null
    if (source.kind === "production") {
      cacheKey = `production:${production.id}`
      load = () => loadProductionCaptionTracks(production.id, sourceParts)
    } else if (source.kind === "take" && source.key.startsWith("part:")) {
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
  }, [production.id, sourceParts])
  const playSource = useCallback(async (source: PlayerSource) => {
    await player.toggleSource(await preparePlayerSource(source))
  }, [player, preparePlayerSource])
  const closeTool = useCallback(() => { setTool(null); setComposerPart(null); setReplacingAsset(null); setComposerExpanded(false); setInlineComposerHost(null); setWorkbenchComposerHost(null) }, [])
  const actions = useProductionActions({ production, music, player, refresh, refreshAssets, preparePlayerSource })
  const refreshCast = useCallback(async () => {
    try {
      const items = await studioApi.productionCast(production.public_id)
      setCast(items); setCastError("")
    } catch (reason) {
      setCastError(reason instanceof Error ? reason.message : "Production Cast is unavailable.")
      throw reason
    }
  }, [production.public_id])
  useEffect(() => { let active = true; void studioApi.productionCast(production.public_id).then((items) => { if (active) { setCast(items); setCastError("") } }).catch((reason) => { if (active) setCastError(reason instanceof Error ? reason.message : "Production Cast is unavailable.") }); return () => { active = false } }, [production.public_id])

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
  const modalTool = mobile ? tool : tool === "speech" ? null : tool
  const modalDetail = mobile ? activeDetail : null
  const overlaysOpen = Boolean(modalTool || modalDetail || moveOpen || confirmAction)

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

  const rememberWorkbenchOrigin = useCallback(() => {
    workbenchOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    canvasScrollPosition.current = document.querySelector<HTMLElement>(".production-canvas")?.scrollTop ?? null
  }, [])

  const openTool = useCallback((next: Exclude<ToolKind, null>, beforePartId: string | null = null) => {
    rememberWorkbenchOrigin()
    setReleaseOpen(false)
    setDetail(null)
    setInsertBeforePartId(beforePartId)
    setComposerPart(null)
    setReplacingAsset(null)
    setComposerExpanded(false)
    setTool(next)
  }, [rememberWorkbenchOrigin])
  const openAssetReplacement = useCallback((part: ProductionPart) => {
    setReleaseOpen(false); setDetail(null); setInsertBeforePartId(null); setComposerPart(null); setReplacingAsset(part); setTool("asset")
  }, [])
  const openNewTake = useCallback((part: ProductionPart) => {
    setReleaseOpen(false); setDetail(null); setInsertBeforePartId(null); setComposerPart(part); setComposerExpanded(false); setTool("speech")
  }, [])
  const openPart = useCallback((part: ProductionPart, tab: PartDetailTab = "script") => {
    rememberWorkbenchOrigin(); setReleaseOpen(false); closeTool(); setDetailTab(tab); setDetail(part)
  }, [closeTool, rememberWorkbenchOrigin])
  const openCaptionContext = useCallback((partId: number) => {
    const part = production.parts.find((item) => item.id === partId)
    if (!part || !["audio", "speech"].includes(part.kind)) return
    document.getElementById(`part-${part.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    openPart(part, "captions")
  }, [openPart, production.parts])
  const openMixExport = useCallback(() => {
    rememberWorkbenchOrigin(); setDetail(null); closeTool(); setReleaseOpen(true)
  }, [closeTool, rememberWorkbenchOrigin])

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
    setReleaseOpen(false)
    setDetail(null)
    closeTool()
  }, [closeTool])
  usePlayerShortcuts({ hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek }, closeTransientUi)

  const workbenchMode: ProductionWorkbenchMode | null = mobile ? null : tool === "speech" && composerExpanded ? "composer" : activeDetail ? "part" : releaseOpen ? "mix-export" : null
  const composerInsertAt = insertBeforePartId ? Math.max(0, sourceParts.findIndex((part) => part.public_id === insertBeforePartId)) : null
  const composerTitle = composerPart ? composerPart.kind === "draft" ? `Record draft · Part ${(composerPart.position ?? 0) + 1}` : `Generate alternative · Part ${(composerPart.position ?? 0) + 1}` : insertBeforePartId ? "Add speech at insertion" : "Add speech"
  const composerDescription = composerPart?.kind === "draft" ? "Turn this saved script into its first recording." : composerPart ? "Create another performance without replacing the selected Take." : insertBeforePartId ? "Insert at the selected Sequence position." : `Add as Part ${sourceParts.length + 1}.`
  const workbenchTitle = workbenchMode === "composer" ? composerTitle : workbenchMode === "part" ? partInspectorTitle(activeDetail) : workbenchMode === "mix-export" ? "Mix & Export" : "Production Workbench"
  const workbenchDescription = workbenchMode === "composer" ? composerDescription : workbenchMode === "part" && activeDetail ? `Revision ${activeDetail.revision || 1}${activeDetail.selected_take_number ? ` · Take ${activeDetail.selected_take_number} selected` : ""}` : workbenchMode === "mix-export" ? "Preview the current mix and create immutable output." : undefined
  const previewPlayingPartId = useMemo(() => {
    if (!actions.productionPlaying) return null
    const position = player.currentTime * 1000
    let elapsed = 0
    for (const part of sourceParts) {
      elapsed += partDurationMs(part)
      if (position < elapsed) return part.id
    }
    return sourceParts.at(-1)?.id || null
  }, [actions.productionPlaying, player.currentTime, sourceParts])
  useLayoutEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".production-canvas")
    if (canvas && canvasScrollPosition.current !== null) canvas.scrollTop = canvasScrollPosition.current
  }, [workbenchMode])
  useLayoutEffect(() => {
    if (!inlineComposerHost || composerExpanded || tool !== "speech") return
    const anchor = inlineComposerHost.closest<HTMLElement>(".sequence-composer-anchor")
    const canvas = anchor?.closest<HTMLElement>(".production-canvas")
    window.requestAnimationFrame(() => {
      if (!anchor || !canvas) return
      const next = canvas.scrollTop + anchor.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 58
      canvas.scrollTop = Math.max(0, next)
    })
  }, [composerExpanded, inlineComposerHost, tool])
  const closeWorkbench = useCallback(() => {
    canvasScrollPosition.current = document.querySelector<HTMLElement>(".production-canvas")?.scrollTop ?? null
    if (tool === "speech") closeTool()
    if (activeDetail) setDetail(null)
    if (releaseOpen) setReleaseOpen(false)
    const origin = workbenchOrigin.current
    window.requestAnimationFrame(() => origin?.focus())
  }, [activeDetail, closeTool, releaseOpen, tool])

  const workbenchContent = workbenchMode === "composer" ? <div className="production-composer-workbench" ref={setWorkbenchComposerHost} /> : workbenchMode === "part" ? <PartInspectorContent
    productionId={production.id}
    part={activeDetail}
    directory={directory}
    playingKey={player.source?.key}
    playerPlaying={actions.playerPlaying}
    onClose={() => setDetail(null)}
    onPlay={(source) => void playSource(source)}
    onChanged={async () => {
      if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause()
      actions.invalidatePreview()
      await refresh()
    }}
    onDuplicate={(part) => void actions.duplicatePart(part)}
    onDelete={(part) => setConfirmAction({
      title: "Delete this part?",
      description: "The Part leaves the active Sequence. Its Takes, provider evidence, generated audio and recorded spend remain recoverable history.",
      action: () => { setDetail(null); void actions.deletePart(part) },
    })}
    onNewTake={openNewTake}
    initialTab={detailTab}
    onTabChange={setDetailTab}
  /> : workbenchMode === "mix-export" ? <MixExportWorkspace production={production} music={music} previewing={actions.previewing} productionPlaying={actions.productionPlaying} exportJob={actions.exportJob} onPreview={actions.toggleProduction} onExport={() => void actions.exportMp3()} exporting={actions.exporting} /> : null

  const sequenceActions: SequenceActions = useMemo(() => ({
    play: (source) => void playSource(source),
    duplicate: (part) => void actions.duplicatePart(part),
    remove: (part) => setConfirmAction({ title: "Delete this part?", description: "It will be removed from this Production. The reusable Venture source, if any, is not deleted.", action: () => void actions.deletePart(part) }),
    move: actions.movePart,
    moveToPosition: setMovePositionPart,
    editSilence: (part, seconds) => void actions.editSilence(part, seconds),
    openPart,
    newTake: openNewTake,
  }), [actions, openNewTake, openPart, playSource])

  return <>
    {castError && <InlineResourceError message={`Production Cast unavailable: ${castError}`} retry={() => void refreshCast().catch(() => undefined)} />}
    <ProductionEditorCanvas
      production={production}
      tree={tree}
      music={music}
      directory={directory}
      cast={cast}
      liveJobs={liveJobs}
      duration={duration}
      workbenchMode={workbenchMode}
      workbenchTitle={workbenchTitle}
      workbenchDescription={workbenchDescription}
      workbenchContent={workbenchContent}
      composerAnchor={!mobile && tool === "speech" ? {
        partId: composerPart?.id || null,
        beforePartId: insertBeforePartId,
        expanded: composerExpanded,
        title: composerTitle,
        hostRef: setInlineComposerHost,
        onCollapse: () => setComposerExpanded(false),
      } : null}
      explorerOpen={explorerOpen}
      castOpen={castOpen}
      healthOpen={healthOpen}
      commandsOpen={commandsOpen}
      selected={selected}
      activePartId={activeDetail?.id}
      playingKey={player.source?.key}
      playerPlaying={actions.playerPlaying}
      previewing={actions.previewing}
      productionPlaying={actions.productionPlaying}
      productionLoaded={actions.productionLoaded}
      productionCurrentTime={actions.productionLoaded ? player.currentTime : 0}
      previewPlayingPartId={previewPlayingPartId}
      onExplorerOpen={setExplorerOpen}
      onCastOpen={setCastOpen}
      onHealthOpen={setHealthOpen}
      onCommandsOpen={setCommandsOpen}
      onCastChanged={async () => { await Promise.all([refreshCast(), refresh()]) }}
      onTool={openTool}
      onSelected={setSelected}
      onPreview={actions.toggleProduction}
      onOpenMixExport={openMixExport}
      onCloseWorkbench={closeWorkbench}
      onLocate={locate}
      onSeekProduction={player.seek}
      onPlay={(source) => void playSource(source)}
      onMusicChange={actions.setMusic}
      onChooseMusic={() => openTool("music")}
      onRetryJob={(part, job) => void retryJob(part, job)}
      onConfirmJob={(part, job) => void confirmJob(part, job)}
      onReplaceAsset={openAssetReplacement}
      onOpenCaptionContext={openCaptionContext}
      sequenceActions={sequenceActions}
    />
    {!mobile && tool === "speech" && <ProductionComposerSession
      target={composerExpanded ? workbenchComposerHost : inlineComposerHost}
      presentation={composerExpanded ? "workbench" : "inline"}
      onExpand={() => setComposerExpanded(true)}
      onClose={closeTool}
      productionId={production.id}
      nextPartNumber={sourceParts.length + 1}
      insertAt={composerInsertAt}
      insertBeforePartId={insertBeforePartId}
      part={composerPart}
      config={config}
      directory={directory}
      cast={cast}
      playingKey={player.source?.key}
      playerPlaying={actions.playerPlaying}
      onSave={async (payload) => { await actions.saveDraft(payload); closeTool() }}
      onUpdateEditorial={async (values) => {
        if (!composerPart) throw new Error("That Part is no longer open.")
        await actions.updatePartEditorial(composerPart, values)
      }}
      onGenerate={queueRender}
      onPlay={(source) => void playSource(source)}
    />}
    <ProductionSelectionBar
      count={selected.size}
      onSelectAll={() => setSelected(new Set(sourceParts.map((part) => part.id)))}
      onMove={() => setMoveOpen(true)}
      onDelete={() => setConfirmAction({
        title: `Delete ${selected.size} parts?`,
        description: "The selected Parts leave the active Sequence. Their Takes, provider evidence and recorded spend remain in history.",
        action: () => void actions.deleteParts([...selected]).then(() => setSelected(new Set())),
      })}
      onClear={() => setSelected(new Set())}
    />
    <MovePartPositionDialog part={movePositionPart} count={sourceParts.length} onClose={() => setMovePositionPart(null)} onMove={actions.movePartToPosition} />
    {overlaysOpen && <Suspense fallback={null}>
      <ProductionOverlays
        tool={modalTool}
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
        activeDetail={modalDetail}
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
        onPlay={(source) => void playSource(source)}
        onCloseDetail={() => setDetail(null)}
        onDetailChanged={async () => {
          if (activeDetail && player.source?.key === `part:${activeDetail.id}`) player.pause()
          actions.invalidatePreview()
          await refresh()
        }}
        onDuplicate={(part) => void actions.duplicatePart(part)}
        onDeleteDetail={(part) => setConfirmAction({
          title: "Delete this part?",
          description: "The Part leaves the active Sequence. Its Takes, provider evidence, generated audio and recorded spend remain recoverable history.",
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
