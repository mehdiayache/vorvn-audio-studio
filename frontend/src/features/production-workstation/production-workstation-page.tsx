import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LoaderCircle, X } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { DeleteProductionDialog } from "@/components/delete-production-dialog"
import { OperatorIconButton } from "@/components/operator-action"
import { PartCaptionsDialog } from "@/features/production/part-captions-dialog"
import { MovePartPositionDialog } from "@/features/production/move-part-position-dialog"
import { ProductionComposerStage } from "@/features/composer/production-composer-host"
import { AudioClipInspector } from "@/features/sound-scene/inspector/music-inspector"
import { SequenceMixInspector } from "@/features/sound-scene/inspector/sequence-mix-inspector"
import { SoundSceneSession, soundTrackDisplayName, useSoundSceneSession, type SoundScenePersistence } from "@/features/sound-scene/engine/sound-scene-session"
import { VisualSceneSession, useVisualSceneSession, visualSelectionRefs } from "@/features/visual-scene/engine/visual-scene-session"
import { videoHasEmbeddedAudio } from "@/features/sound-scene/engine/video-audio-sync"
import { visualTrackDisplayName } from "@/features/visual-scene/timeline/visual-timeline-parts"
import { ProductionFloatingTransport } from "@/features/production/production-floating-transport"
import { productionHealth } from "@/features/production/production-health-sheet"
import { useProductionSpeechJobs } from "@/features/production/use-production-speech-jobs"
import type { ConfirmAction } from "@/features/production/production-overlays"
import type { ToolKind } from "@/components/production-tools"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useProductionActions } from "@/hooks/use-production-actions"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import { audioStudioBase } from "@/lib/links"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import { loadPartCaptionTracks, loadProductionCaptionTracks } from "@/lib/production-caption-tracks"
import { studioApi } from "@/lib/api"
import type {
  AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, PlayerCaptionTrack,
  PlayerSource, Production, ProductionPart, SoundScene, StudioConfig, VentureAsset, VisualScene, VoiceDirectory,
} from "@/types/domain"
import { workstationPartState, type SequenceInsertKind, type WorkstationPartActions } from "./workstation-sequence"
import { WorkstationPartInspector } from "./workstation-part-inspector"
import { DirectorStage } from "./director/director-stage"
import { ExportStage, ReleaseInspector } from "./export/export-stage"
import { ScriptStage } from "./script/script-stage"
import { TimelineStage } from "./timeline/timeline-stage"
import { productionTimelineDurationMs } from "./timeline/timeline-duration"
import { VisualClipInspector } from "./timeline/visual-clip-inspector"
import { WorkstationHeader } from "./workstation-header"
import { AudioGroupInspector, EmptyInspector } from "./workstation-stage-support"
import type { WorkstationStage } from "./workstation-workflow"

import "./production-workstation.css"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

type AudioTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string } | { mode: "replace"; trackId: string; clipId: string }

const overlayLoadingLabels: Partial<Record<NonNullable<ToolKind>, string>> = {
  speech: "Opening Speech editor",
  silence: "Opening Pause controls",
  import: "Opening JSON import",
  asset: "Opening Audio Library",
  audio: "Opening Audio Library",
}

function ProductionOverlayLoading({ tool }: { tool: ToolKind }) {
  const label = tool ? overlayLoadingLabels[tool] || "Opening confirmation" : "Opening confirmation"
  return <div className="ws-overlay-loading" role="status" aria-live="polite"><span><LoaderCircle className="spin" /><b>{label}…</b></span></div>
}

function initialSelection(production: Production) {
  if (typeof window !== "undefined") {
    const key = new URL(window.location.href).searchParams.get("part")
    const found = key && production.parts.find((part) => part.public_id === key || String(part.id) === key)
    if (found) return found.id
  }
  return null
}

function partKindLabel(part: ProductionPart) {
  if (part.kind === "draft") return "Speech draft"
  if (part.kind === "asset") return "Linked audio"
  return part.kind.charAt(0).toUpperCase() + part.kind.slice(1).replaceAll("_", " ")
}

function partDeletionLabel(part: ProductionPart) {
  const number = formatPartNumber(part.position ?? 0)
  if (part.kind === "silence") return `Part ${number} · Pause`
  if (part.kind === "asset") return `Part ${number} · ${part.title || "Linked audio"}`
  return `Part ${number} · ${formatAuthoredRole(part.authored_role) || part.voice_name || part.voice || "Speech"}`
}

export function ProductionWorkstationPage({ production, tree, soundScene, visualScene, assets, assetCollections, directorAssetIds, config, directory, refresh, refreshAssets }: {
  production: Production
  tree: HierarchyNode[] | null
  soundScene: SoundScene
  visualScene: VisualScene
  assets: VentureAsset[]
  assetCollections: AssetCollection[]
  directorAssetIds: number[]
  config: StudioConfig | null
  directory: VoiceDirectory
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
}) {
  const navigate = useNavigate()
  const player = useGlobalPlayer()
  const [stage, setStage] = useState<WorkstationStage>("sequence")
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(() => initialSelection(production))
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerPartId, setComposerPartId] = useState<number | null>(null)
  const [releaseInspectorOpen, setReleaseInspectorOpen] = useState(false)
  const [tool, setTool] = useState<ToolKind>(null)
  const [audioTarget, setAudioTarget] = useState<AudioTarget | null>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [captionPartId, setCaptionPartId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [deleteProductionOpen, setDeleteProductionOpen] = useState(false)
  const [movePositionPart, setMovePositionPart] = useState<ProductionPart | null>(null)
  const [replacingAsset, setReplacingAsset] = useState<ProductionPart | null>(null)
  const centerPaneRef = useRef<HTMLElement | null>(null)
  const soundSessionRef = useRef<SoundSceneSession | null>(null)
  const visualPersistence = useRef((document: VisualScene["document"], expectedRevision: number) => studioApi.updateVisualScene(production.id, expectedRevision, document))
  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
  const activeSourceParts = useMemo(() => sourceParts.filter((part) => part.enabled !== false), [sourceParts])
  const pendingDraftCount = useMemo(() => activeSourceParts.filter((part) => part.kind === "draft").length, [activeSourceParts])
  const selectedPart = selectedId ? sourceParts.find((part) => part.id === selectedId) || null : null
  const composerPart = composerPartId ? sourceParts.find((part) => part.id === composerPartId) || null : null
  const captionPart = captionPartId ? sourceParts.find((part) => part.id === captionPartId) || null : null
  const liveJobs = useProductionSpeechJobs(production.parts, refresh)
  const captionTrackCache = useRef(new Map<string, Promise<PlayerCaptionTrack[]>>())
  useEffect(() => captionTrackCache.current.clear(), [production.id, production.parts])
  const preparePlayerSource = useCallback(async (source: PlayerSource) => {
    if (source.captionTracks?.length) return source
    const part = source.kind === "clip" && source.key.startsWith("part:") ? sourceParts.find((item) => item.id === Number(source.key.slice(5))) : null
    const key = source.kind === "production" ? `production:${production.id}` : part ? `part:${part.id}` : ""
    if (!key) return source
    try {
      const request = captionTrackCache.current.get(key) || (part ? loadPartCaptionTracks(production.id, part) : loadProductionCaptionTracks(production.id, activeSourceParts))
      captionTrackCache.current.set(key, request)
      return { ...source, captionTracks: await request }
    } catch {
      captionTrackCache.current.delete(key)
      return source
    }
  }, [activeSourceParts, production.id, sourceParts])
  const playSource = useCallback(async (source: PlayerSource) => {
    soundSessionRef.current?.pause()
    await player.toggleSource(await preparePlayerSource(source))
  }, [player, preparePlayerSource])
  const actions = useProductionActions({ production, soundScene, player, refresh, refreshAssets, preparePlayerSource, feedbackMode: "inline" })
  const soundPersistence = useRef<SoundScenePersistence>({
    update: actions.updateSoundScene,
    undo: actions.undoSoundScene,
    redo: actions.redoSoundScene,
  })
  soundPersistence.current = {
    update: actions.updateSoundScene,
    undo: actions.undoSoundScene,
    redo: actions.redoSoundScene,
  }
  const soundSession = useMemo(() => new SoundSceneSession(soundScene, {
    update: (document, expectedRevision) => soundPersistence.current.update(document, expectedRevision),
    undo: () => soundPersistence.current.undo(),
    redo: () => soundPersistence.current.redo(),
  }, undefined, () => player.pause()), [production.id])
  soundSessionRef.current = soundSession
  const soundState = useSoundSceneSession(soundSession)
  useEffect(() => { soundSession.reconcile(soundScene) }, [soundScene, soundSession])
  useEffect(() => () => soundSession.dispose(), [soundSession])
  useEffect(() => {
    if (stage === "sound") void soundSession.activatePlayout()
    else soundSession.deactivatePlayout()
  }, [soundSession, stage])
  const initialDurationMs = productionTimelineDurationMs(soundScene, visualScene.document)
  visualPersistence.current = async (document, expectedRevision) => {
    const saved = await studioApi.updateVisualScene(production.id, expectedRevision, document)
    try {
      await soundSession.syncVisualAudio(saved.document, assets)
    } catch (reason) {
      soundSession.reportError(reason instanceof Error
        ? reason.message
        : "The video audio track could not be synchronized.")
    }
    return saved
  }
  const visualSession = useMemo(() => new VisualSceneSession(visualScene, { update: (document, expectedRevision) => visualPersistence.current(document, expectedRevision) }, initialDurationMs), [production.id])
  const visualState = useVisualSceneSession(visualSession)
  const duration = productionTimelineDurationMs(soundState.scene, visualState.document) / 1000
  useEffect(() => { visualSession.setTimelineDuration(duration * 1000); visualSession.reconcile(visualScene) }, [duration, visualScene, visualSession])
  useEffect(() => {
    void soundSession.syncVisualAudio(visualScene.document, assets).catch((reason) =>
      soundSession.reportError(reason instanceof Error
        ? reason.message
        : "The video audio track could not be synchronized."))
  }, [assets, soundSession, visualScene.document])
  const issues = useMemo(() => productionHealth(production.parts), [production.parts])
  const staleOverrides = useMemo(() => soundState.scene.resolved.orphans.flatMap((orphan) =>
    orphan.kind === "sequence_override" && orphan.part_public_id ? [orphan.part_public_id] : []), [soundState.scene.resolved.orphans])
  const assetCollectionIds = Object.fromEntries(assetCollections.map((collection) => [collection.name, collection.id]))
  const usedAssetIds = useMemo(() => [...new Set([
    ...sourceParts.flatMap((part) => part.asset_id ? [part.asset_id] : []),
    ...soundState.scene.document.tracks.flatMap((track) => track.clips.map((clip) => clip.asset_id)),
    ...visualState.document.tracks.flatMap((track) => track.clips.map((clip) => clip.asset_id)),
  ])], [soundState.scene.document.tracks, sourceParts, visualState.document.tracks])
  const renameProduction = useCallback(async (name: string) => {
    await studioApi.updateResource<Production>("productions", production.id, { name })
    await refresh()
  }, [production.id, refresh])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedPart) url.searchParams.set("part", selectedPart.public_id || String(selectedPart.id))
    else url.searchParams.delete("part")
    window.history.replaceState(window.history.state, "", url)
  }, [selectedPart])

  useEffect(() => {
    centerPaneRef.current?.scrollTo({ top: 0, left: 0 })
  }, [stage])

  useEffect(() => {
    if (stage !== "sequence" || !selectedId) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`ws-part-${selectedId}`)?.scrollIntoView({ block: "nearest" })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId, stage])

  const selectPart = useCallback((part: ProductionPart) => {
    setSelectedId(part.id)
    setComposerOpen(false)
    setComposerPartId(null)
  }, [])
  const editPart = useCallback((part: ProductionPart) => {
    setStage("sequence")
    setSelectedId(part.id)
    setComposerPartId(part.id)
    setComposerOpen(true)
  }, [])
  const openNewSpeech = useCallback((before?: ProductionPart | null) => {
    setStage("sequence")
    setSelectedId(before?.id || selectedId)
    setInsertBeforePartId(before?.public_id || null)
    setComposerPartId(null)
    setComposerOpen(true)
    setTool(null)
  }, [selectedId])
  const openSequenceInsert = useCallback((kind: SequenceInsertKind, before?: ProductionPart | null) => {
    if (kind === "speech") { openNewSpeech(before); return }
    setStage("sequence")
    setSelectedId(before?.id || selectedId)
    setInsertBeforePartId(before?.public_id || null)
    setComposerPartId(null)
    setComposerOpen(false)
    setTool(kind)
  }, [openNewSpeech, selectedId])
  const closeComposer = useCallback(() => { setComposerOpen(false); setComposerPartId(null); setInsertBeforePartId(null) }, [])
  const changeStage = useCallback((next: WorkstationStage) => {
    if (next !== "sound") soundSession.pause()
    setStage(next)
    closeComposer()
    setReleaseInspectorOpen(next === "mix")
  }, [closeComposer, soundSession])
  const queueRender = useCallback((payload: GeneratePayload) => {
    const request = composerPart ? actions.recordPendingPart(composerPart, payload) : actions.generatePart(payload)
    return request.then((job) => { closeComposer(); void refresh().catch(() => undefined); return job })
  }, [actions, closeComposer, composerPart, refresh])
  const requestPartDeletion = useCallback((part: ProductionPart) => setConfirmAction({
    title: `Delete “${partDeletionLabel(part)}” permanently?`,
    description: part.kind === "asset"
      ? "This removes this linked-audio Part from the Script. The reusable Venture asset remains available."
      : part.kind === "silence"
        ? "This permanently removes this Silence Part from the Script."
        : "This removes the whole story part: its text, recording and captions. Previous provider spend remains in Activity.",
    confirmLabel: "Delete Part permanently",
    kind: "confirm",
    action: async () => { if (player.source?.key === `part:${part.id}`) player.pause(); await actions.deletePart(part); setSelectedId(null) },
  }), [actions, player])
  const requestExport = useCallback((format: "mp3" | "mp4") => {
    if (!pendingDraftCount) { void actions.exportProduction(format); return }
    const label = format.toUpperCase()
    setConfirmAction({
      title: `Export the current ${label}?`,
      description: `${pendingDraftCount} planned Speech Part${pendingDraftCount === 1 ? " has" : "s have"} no recording yet. They stay safely in Script and will not be included in this ${label}.`,
      confirmLabel: `Export ${label}`,
      kind: "confirm",
      variant: "default",
      action: () => actions.exportProduction(format, true),
    })
  }, [actions, pendingDraftCount])
  const openTool = useCallback((kind: Exclude<ToolKind, null>) => {
    if (kind === "speech") { openNewSpeech(); return }
    if (kind === "audio") setAudioTarget({ mode: "new-track" })
    setInsertBeforePartId(null)
    setTool(kind)
  }, [openNewSpeech])
  const openAssetReplacement = useCallback((part: ProductionPart) => {
    setInsertBeforePartId(null)
    setReplacingAsset(part)
    setTool("asset")
  }, [])
  const retryJob = useCallback(async (part: ProductionPart, _job: DurableJob<GenerateResult>) => {
    const payload = { ...(part.speech_job?.request || {}), production_id: production.id } as GeneratePayload
    if (!payload.text || part.clip_id) return
    await actions.recordPendingPart(part, payload)
    await refresh()
  }, [actions, production.id, refresh])
  const confirmJob = useCallback(async (_part: ProductionPart, job: DurableJob<GenerateResult>) => {
    await studioApi.confirmJob<GenerateResult>(job.id)
    await refresh()
  }, [refresh])
  const partActions: WorkstationPartActions = useMemo(() => ({
    select: selectPart,
    edit: editPart,
    replaceAsset: openAssetReplacement,
    play: (source) => void playSource(source),
    captions: (part) => setCaptionPartId(part.id),
    duplicate: (part) => void actions.duplicatePart(part),
    remove: requestPartDeletion,
    move: actions.movePart,
    moveToPosition: setMovePositionPart,
    retry: (part, job) => void retryJob(part, job),
    confirm: (part, job) => void confirmJob(part, job),
    setEnabled: (part, enabled) => void actions.setPartEnabled(part, enabled),
    editSilence: (part, seconds) => void actions.editSilence(part, seconds),
    addBefore: (part, kind) => openSequenceInsert(kind, part),
    reorderToPosition: (part, position) => void actions.movePartToPosition(part, position),
    isPending: (part, action) => actions.isActionPending(`part:${part.id}:${action}`),
  }), [actions, confirmJob, editPart, openAssetReplacement, openSequenceInsert, playSource, requestPartDeletion, retryJob, selectPart])

  const soundSelection = soundState.selection
  const soundSpan = soundSelection?.kind === "part"
    ? soundState.scene.resolved.sequence_projection.spans.find((span) => span.part_id === soundSelection.id) || null
    : null
  const resolvedAudioTrack = soundSelection?.kind === "clip"
    ? soundState.scene.resolved.tracks.find((track) => track.id === soundSelection.trackId) || null
    : null
  const engineAudioTrack = resolvedAudioTrack ? soundState.engine.tracks.find((track) => track.id === resolvedAudioTrack.id) : null
  const audioTrack = resolvedAudioTrack ? {
    ...resolvedAudioTrack,
    volume: engineAudioTrack?.volume ?? resolvedAudioTrack.volume,
    muted: engineAudioTrack?.muted ?? resolvedAudioTrack.muted,
  } : null
  const audioClip = soundSelection?.kind === "clip"
    ? soundSession.currentClip(soundSelection.trackId, soundSelection.clipId)
    : null
  const audioAsset = audioClip ? assets.find((asset) => asset.id === audioClip.asset_id) : undefined
  const audioClipName = audioClip?.asset_name || "Audio clip"
  const visualSelection = visualState.selection
  const visualRefs = visualSelectionRefs(visualSelection)
  const visualRef = visualRefs[0] || null
  const visualTrack = visualRef ? visualState.document.tracks.find((track) => track.id === visualRef.trackId) || null : null
  const visualClip = visualRef ? visualTrack?.clips.find((clip) => clip.id === visualRef.clipId) || null : null
  const visualAsset = visualClip ? assets.find((asset) => asset.id === visualClip.asset_id) : undefined
  const linkedVideoAudio = visualClip ? soundState.scene.resolved.tracks.flatMap((track) =>
    track.clips.flatMap((clip) => clip.linked_visual_clip_id === visualClip.id
      ? [{ trackId: track.id, clip }]
      : [])).at(0) : undefined
  const playingPart = actions.playerPlaying && player.source?.key.startsWith("part:")
    ? sourceParts.find((part) => part.id === Number(player.source?.key.slice(5))) || null
    : null
  const inspectorTitle = composerOpen ? (composerPart ? `Edit Part ${formatPartNumber(composerPart.position ?? 0)}` : "New speech")
    : stage === "sequence" && selectedPart ? `Part ${formatPartNumber(selectedPart.position ?? 0)} · ${formatAuthoredRole(selectedPart.authored_role) || partKindLabel(selectedPart)}`
      : stage === "sound" && visualClip ? `${visualTrack?.media_type === "video" ? "Video" : "Image"} clip`
        : stage === "sound" && soundSelection?.kind === "clip" ? "Audio clip"
        : stage === "sound" && soundSelection?.kind === "clips" ? `${soundSelection.clips.length} audio clips`
          : stage === "sound" && soundSpan ? `${soundSpan.role || soundSpan.voice_name || "Script Part"} · Mix`
          : stage === "mix" ? "Release checks" : "Inspector"
  const composerInsertAt = insertBeforePartId ? Math.max(0, sourceParts.findIndex((part) => part.public_id === insertBeforePartId)) : null

  const inspector = composerOpen ? <ProductionComposerStage
    productionId={production.id} nextPartNumber={sourceParts.length + 1} insertAt={composerInsertAt} insertBeforePartId={insertBeforePartId}
    part={composerPart} config={config} directory={directory} playingKey={player.source?.key} playerPlaying={actions.playerPlaying}
    onSave={async (payload) => { await actions.saveDraft(payload); closeComposer() }}
    onUpdateEditorial={async (values) => { if (!composerPart) throw new Error("That Part is no longer open."); await actions.updatePartEditorial(composerPart, values) }}
    onGenerate={queueRender} onPlay={(source) => void playSource(source)}
  /> : stage === "sequence" && selectedPart ? <WorkstationPartInspector
    productionId={production.id} part={selectedPart} directory={directory} playingKey={player.source?.key} playerPlaying={actions.playerPlaying}
    onPlay={(source) => void playSource(source)} onChanged={async () => { actions.invalidatePreview(); await refresh() }}
    onDuplicate={(part) => void actions.duplicatePart(part)} onDelete={requestPartDeletion} onEdit={editPart} onOpenCaptions={(part) => setCaptionPartId(part.id)} onReplaceAsset={openAssetReplacement}
  /> : stage === "sound" && visualRef && visualTrack && visualClip ? <VisualClipInspector
    clipRef={visualRef} track={visualTrack} clip={visualClip} asset={visualAsset} session={visualSession} saving={visualState.saving || soundState.saving}
    hasEmbeddedAudio={videoHasEmbeddedAudio(visualAsset)} audioMuted={linkedVideoAudio?.clip.muted} audioGain={linkedVideoAudio?.clip.gain}
    onAudioMutedChange={linkedVideoAudio ? (muted) => soundSession.commitClipChanges(linkedVideoAudio.trackId, linkedVideoAudio.clip.id, { muted }) : undefined}
    onAudioGainChange={linkedVideoAudio ? (gain) => soundSession.updateClip(linkedVideoAudio.trackId, linkedVideoAudio.clip.id, { gain }) : undefined}
    onAudioGainCommit={linkedVideoAudio ? () => soundSession.commitClip() : undefined}
  /> : stage === "sound" && soundSelection?.kind === "clip" && audioTrack ? <AudioClipInspector
    track={audioTrack} clip={audioClip} asset={audioAsset} playingKey={player.source?.key} playing={actions.playerPlaying} onPlay={(source) => void playSource(source)}
    onClipChange={(changes) => { if (audioClip) soundSession.updateClip(audioTrack.id, audioClip.id, changes) }} onClipCommit={() => soundSession.commitClip()}
    onTrackVolumeChange={(volume) => soundSession.setTrackVolume(audioTrack.id, volume)} onTrackVolumeCommit={(volume) => soundSession.commitTrackVolume(audioTrack.id, volume)}
    onChoose={() => { setAudioTarget({ mode: "replace", trackId: soundSelection.trackId, clipId: soundSelection.clipId }); setTool("audio") }} onRemove={() => setConfirmAction({ title: `Remove “${audioClipName}”?`, description: "The reusable Audio Library asset remains available. Only this Timeline placement is removed.", action: () => soundSession.removeClip(soundSelection.trackId, soundSelection.clipId) })}
  /> : stage === "sound" && soundSpan ? <SequenceMixInspector
    span={soundSpan} saving={soundState.saving}
    onPreview={(changes) => soundSession.previewSequenceOverride(soundSpan.part_public_id, changes)}
    onCommit={(changes) => soundSession.updateSequenceOverride(soundSpan.part_public_id, changes)}
    onOpenSequence={() => { soundSession.select(null); setStage("sequence"); setSelectedId(soundSpan.part_id) }}
  /> : stage === "sound" && soundSelection?.kind === "clips" ? <AudioGroupInspector count={soundSelection.clips.length} />
    : stage === "mix" && releaseInspectorOpen ? <ReleaseInspector
      issues={issues} staleOverrides={staleOverrides}
      onLocate={(id) => { setStage("sequence"); setSelectedId(id); setReleaseInspectorOpen(false); requestAnimationFrame(() => document.getElementById(`ws-part-${id}`)?.scrollIntoView({ block: "center" })) }}
      onRemoveOverride={(partPublicId) => { void soundSession.removeSequenceOverride(partPublicId) }}
    /> : <EmptyInspector stage={stage} />

  const inspectorOpen = composerOpen || stage === "sequence" && Boolean(selectedPart) || stage === "sound" && Boolean(soundSelection || visualSelection) || stage === "mix" && releaseInspectorOpen
  const collapsedPart = playingPart || (stage === "sequence" ? selectedPart : null)
  const collapsedState = collapsedPart ? workstationPartState(collapsedPart) : issues.length || staleOverrides.length ? "issue" : sourceParts.some((part) => workstationPartState(part) === "draft") ? "draft" : "ready"
  const collapsedNumber = collapsedPart
    ? formatPartNumber(collapsedPart.position ?? sourceParts.indexOf(collapsedPart))
    : String(stage === "sequence" ? sourceParts.length : issues.length + staleOverrides.length)
  const closeInspector = () => {
    if (composerOpen) { closeComposer(); return }
    if (stage === "sequence") setSelectedId(null)
    else if (stage === "sound") { soundSession.select(null); visualSession.select(null) }
    else setReleaseInspectorOpen(false)
  }

  const overlaysOpen = Boolean(tool || confirmAction)
  usePlayerShortcuts(
    { hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek },
    () => {
      setTool(null); setConfirmAction(null); setCaptionPartId(null); setMovePositionPart(null); setReplacingAsset(null)
      if (composerOpen) closeComposer()
    }, undefined, stage !== "sound",
  )
  return <>
    <section className="production-workstation" data-stage={stage} data-outline-open={outlineOpen ? "true" : "false"} data-inspector-open={inspectorOpen ? "true" : "false"} data-inspector-expanded={composerOpen ? "true" : "false"}>
      <WorkstationHeader production={production} tree={tree} duration={duration} stage={stage} issueCount={issues.length + staleOverrides.length} previewing={stage === "sound" ? soundState.playback === "preparing" : actions.previewing} playing={stage === "sound" ? soundState.playback === "playing" : actions.productionPlaying} mutationStatus={actions.mutationStatus} onStage={changeStage} onPreview={() => { if (stage === "sound") void soundSession.togglePlayback(); else void actions.toggleProduction() }} onAdd={openTool} onDelete={() => setDeleteProductionOpen(true)} onRename={renameProduction} />
      <div className="ws-body">
        {stage === "sequence" && <ScriptStage
          centerPaneRef={centerPaneRef}
          parts={sourceParts}
          selectedId={selectedId}
          playingKey={player.source?.key}
          playerPlaying={actions.playerPlaying}
          liveJobs={liveJobs}
          directory={directory}
          actions={partActions}
          outlineOpen={outlineOpen}
          collapsedNumber={collapsedNumber}
          collapsedState={collapsedState}
          onSelect={selectPart}
          onOutlineOpenChange={setOutlineOpen}
          onAddEnd={(kind) => openSequenceInsert(kind)}
        />}
        {stage === "director" && <DirectorStage
          centerPaneRef={centerPaneRef}
          productionId={production.id}
          assets={assets}
          directorAssetIds={directorAssetIds}
          onRefresh={refreshAssets}
          onConfirmAction={setConfirmAction}
          onAddToTimeline={async (asset) => {
            await visualSession.addVisual(asset, soundSession.snapshot().playhead * 1000)
            setStage("sound")
          }}
          onUpload={async (file) => {
            const collectionId = assetCollectionIds.Stingers
            if (!collectionId) throw new Error("The visual library is unavailable.")
            return await studioApi.uploadAsset(collectionId, file, {
              name: file.name.replace(/\.[^.]+$/, ""),
              category: "other",
              scope: "venture",
              tags: [],
            }) as VentureAsset
          }}
        />}
        {stage === "sound" && <TimelineStage
          centerPaneRef={centerPaneRef}
          directorAssetIds={directorAssetIds}
          session={soundSession}
          visual={{
            session: visualSession,
            assets,
            onAddVisual: () => undefined,
            onRemoveClip: (refs, name) => setConfirmAction({
              title: `Remove this media placement: “${name}”?`,
              description: refs.length === 1 ? "This removes only the Timeline placement. The source remains available in Director and Visual Library." : `This removes ${refs.length} Timeline placements. Their sources remain available in Director and Visual Library.`,
              action: () => visualSession.removeClips(refs),
            }),
            onRemoveTrack: (track) => setConfirmAction({
              title: `Remove this ${visualTrackDisplayName(track, assets)} track?`,
              description: `This removes the track and its ${track.clips.length} media placement${track.clips.length === 1 ? "" : "s"}. Director Assets remain available.`,
              action: () => visualSession.removeTrack(track.id),
            }),
          }}
          onAddAudio={(target) => { setAudioTarget(target); setTool("audio") }}
          onRemoveClip={({ clips }) => {
            const names = clips.flatMap((ref) => {
              const clip = soundState.scene.resolved.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
              return clip ? [clip.asset_name || "Audio clip"] : []
            })
            setConfirmAction({
              title: clips.length === 1 ? `Remove this clip: “${names[0] || "Audio clip"}”?` : `Remove ${clips.length} selected audio clips?`,
              description: "Reusable Audio Library assets remain available. Only the selected Timeline placements are removed.",
              action: () => soundSession.removeClips(clips),
            })
          }}
          onRemoveTrack={(track) => setConfirmAction({
            title: `Remove this ${soundTrackDisplayName(track)} track?`,
            description: `This removes the track and its ${track.clips.length} placement${track.clips.length === 1 ? "" : "s"}. Reusable Audio Library assets remain available.`,
            action: () => soundSession.removeTrack(track.id),
          })}
          onOpenSequence={(partId) => { setStage("sequence"); setSelectedId(partId) }}
        />}
        {stage === "mix" && <ExportStage
          centerPaneRef={centerPaneRef}
          production={production}
          soundScene={soundScene}
          visualScene={visualScene}
          outlineOpen={outlineOpen}
          collapsedNumber={collapsedNumber}
          collapsedState={collapsedState}
          collapsedPlaying={Boolean(playingPart)}
          onOutlineOpenChange={setOutlineOpen}
          exportJob={actions.exportJob}
          onExport={requestExport}
          onLocatePart={(id) => { setStage("sequence"); setSelectedId(id) }}
          onOpenHealth={() => setReleaseInspectorOpen(true)}
          exporting={actions.exporting}
        />}
        {inspectorOpen && <aside className="ws-right-pane" aria-label="Contextual inspector">
          <header><h2>{inspectorTitle}</h2><OperatorIconButton label="Close inspector" detail="Keeps the current Production changes." onClick={closeInspector}><X /></OperatorIconButton></header>
          <div className="ws-inspector-content">{inspector}</div>
        </aside>}
      </div>
      <ProductionFloatingTransport
        soundSession={stage === "sound" ? soundSession : undefined}
        previewStale={Boolean(player.source?.kind === "production" && !actions.productionLoaded)}
        onRefreshPreview={() => void actions.toggleProduction()}
        onOpenCaptionContext={(partId) => {
          if (!sourceParts.some((part) => part.id === partId)) return
          setStage("sequence")
          setSelectedId(partId)
          setCaptionPartId(partId)
        }}
      />
    </section>
    <DeleteProductionDialog production={production} open={deleteProductionOpen} onOpenChange={setDeleteProductionOpen} onDeleted={() => { player.pause(); navigate(`${audioStudioBase}/projects/${production.project_id}`) }} />
    <PartCaptionsDialog productionId={production.id} part={captionPart} directory={directory} onOpenChange={(open) => { if (!open) setCaptionPartId(null) }} onChanged={async () => { actions.invalidatePreview(); await refresh() }} />
    <MovePartPositionDialog part={movePositionPart} count={sourceParts.length} onClose={() => setMovePositionPart(null)} onMove={actions.movePartToPosition} />
    {overlaysOpen && <Suspense fallback={<ProductionOverlayLoading tool={tool} />}><ProductionOverlays
      tool={tool} production={production} nextPartNumber={sourceParts.length + 1} insertAt={composerInsertAt} insertBeforePartId={insertBeforePartId}
      composerPart={null} replacingAssetId={replacingAsset?.asset_id} initialAudioAssetId={audioClip?.asset_id} config={config} directory={directory} assets={assets} usedAssetIds={usedAssetIds} assetCollectionIds={assetCollectionIds}
      playingKey={player.source?.key} playerPlaying={actions.playerPlaying} confirmAction={confirmAction}
      onCloseTool={() => { setTool(null); setReplacingAsset(null); setAudioTarget(null) }} onSaveDraft={actions.saveDraft} onUpdateEditorial={async () => undefined} onGenerate={queueRender}
      onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertBeforePartId); setTool(null) }}
      onInsertAsset={async (asset) => { if (replacingAsset) await actions.replaceAsset(replacingAsset, asset); else await actions.insertAsset(asset, insertBeforePartId); setTool(null); setReplacingAsset(null) }}
      onPlaceAudio={async (asset) => {
        if (audioTarget?.mode === "replace") await soundSession.replaceClipSource(audioTarget.trackId, audioTarget.clipId, asset)
        else if (audioTarget?.mode === "add-clip") await soundSession.addClip(audioTarget.trackId, asset, soundSession.snapshot().playhead)
        else await soundSession.addTrack(asset, soundSession.snapshot().playhead)
        setTool(null); setAudioTarget(null); setStage("sound")
      }}
      onUploadAsset={async (folder, input) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); return actions.uploadAsset(collectionId, folder, input) }}
      onKeepAsset={async (folder, input) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); return actions.keepFreesound(collectionId, input) }}
      onKeepGenerated={async (folder, input) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); return actions.keepGeneratedAudio(collectionId, input) }}
      onImported={() => { actions.invalidatePreview(); void refresh().then(() => setTool(null)) }}
      onPlay={(source) => void playSource(source)} onConfirmAction={setConfirmAction}
    /></Suspense>}
  </>
}
