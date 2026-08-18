import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AudioLines, Check, ChevronDown, ChevronRight, CircleAlert, FileJson2,
  ListMusic, LoaderCircle, MoreHorizontal, Music2, Pause, PencilLine, Play, Plus, Search,
  PanelLeftOpen, SlidersHorizontal, Sparkles, Trash2, X,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { DeleteProductionDialog } from "@/components/delete-production-dialog"
import { AudioStudioRailToggle } from "@/components/app-shell"
import { PartCaptionsDialog } from "@/features/production/part-captions-dialog"
import { MovePartPositionDialog } from "@/features/production/move-part-position-dialog"
import { ProductionComposerStage } from "@/features/composer/production-composer-host"
import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import { MusicWorkbench } from "@/features/production/music-workbench"
import { ProductionFloatingTransport } from "@/features/production/production-floating-transport"
import { productionHealth, type ProductionHealthIssue } from "@/features/production/production-health-sheet"
import { useProductionSpeechJobs } from "@/features/production/use-production-speech-jobs"
import type { ConfirmAction } from "@/features/production/production-overlays"
import type { ToolKind } from "@/components/production-tools"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useProductionActions } from "@/hooks/use-production-actions"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import type { ProductionMutationStatus } from "@/hooks/use-production-actions"
import { audioStudioBase, resourceHref } from "@/lib/links"
import { formatAuthoredRole, formatDuration, formatMoney, formatPartNumber, partDurationMs } from "@/lib/format"
import { loadPartCaptionTracks, loadProductionCaptionTracks } from "@/lib/production-caption-tracks"
import { studioApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type {
  AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, MusicBed, PlayerCaptionTrack,
  PlayerSource, Production, ProductionPart, StudioConfig, VentureAsset, VoiceDirectory,
} from "@/types/domain"
import { WorkstationOutline, WorkstationSequence, type WorkstationPartActions } from "./workstation-sequence"
import { WorkstationPartInspector } from "./workstation-part-inspector"
import { SoundDesignOutline, WorkstationSoundDesign, type SoundSelection } from "./workstation-sound-design"
import { WorkstationPaneHeader } from "./workstation-pane-header"

import "./production-workstation.css"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

type WorkstationStage = "sequence" | "sound" | "mix"

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

export function InlineProductionName({ name, onRename }: { name: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const cancelOnBlur = useRef(false)

  useEffect(() => { if (!editing) setValue(name) }, [editing, name])

  async function commit() {
    const next = value.trim()
    if (!next) { setError("Name cannot be empty."); return }
    if (next === name) { setEditing(false); setError(""); return }
    setSaving(true); setError("")
    try { await onRename(next); setEditing(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The Production name could not be saved.") }
    finally { setSaving(false) }
  }

  return <div className="ws-inline-name">
    <h1>{editing ? <Input
      aria-label="Production name"
      autoFocus
      disabled={saving}
      maxLength={160}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => {
        if (cancelOnBlur.current) { cancelOnBlur.current = false; setEditing(false); setError(""); return }
        void commit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") { cancelOnBlur.current = true; setValue(name); event.currentTarget.blur() }
      }}
    /> : <button type="button" onClick={() => setEditing(true)} aria-label={`Rename Production ${name}`}>{name}<PencilLine aria-hidden="true" /></button>}</h1>
    {error && <span role="alert">{error}</span>}
  </div>
}

function WorkstationHeader({ production, duration, stage, issueCount, previewing, playing, mutationStatus, onStage, onPreview, onAdd, onDelete, onRename }: {
  production: Production
  duration: number
  stage: WorkstationStage
  issueCount: number
  previewing: boolean
  playing: boolean
  mutationStatus: ProductionMutationStatus
  onStage: (stage: WorkstationStage) => void
  onPreview: () => void
  onAdd: (kind: Exclude<ToolKind, null>) => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
}) {
  const parent = production.trail.at(-1)
  const parentHref = parent ? resourceHref(parent.type, parent.public_id) : `${audioStudioBase}/projects/${production.project_id}`
  const parentName = parent?.name || "Project"
  return <header className="ws-header">
    <div className="ws-header-context">
      <AudioStudioRailToggle className="ws-shell-toggle" tooltipSide="bottom" />
      <Link className="ws-parent-link" to={parentHref}>{parentName}</Link>
      <ChevronRight className="ws-breadcrumb-separator" aria-hidden="true" />
      <InlineProductionName name={production.name} onRename={onRename} />
      {production.status && production.status !== "draft" && <span className="ws-status">{production.status.replaceAll("_", " ")}</span>}
      {mutationStatus !== "idle" && <span className={`ws-save-state is-${mutationStatus}`} role="status" aria-live="polite">{mutationStatus === "saving" ? <LoaderCircle className="spin" /> : <Check />}{mutationStatus === "saving" ? "Saving…" : "Saved"}</span>}
      <dl><div><dt>Parts</dt><dd>{production.parts.filter((part) => part.kind !== "stitch").length}</dd></div><div><dt>Duration</dt><dd>{formatDuration(duration)}</dd></div><div><dt>Spend</dt><dd>{formatMoney(production.current_sequence_cost)}</dd></div></dl>
    </div>
    <nav className="ws-workflow" aria-label="Production workflow">
      <button className={stage === "sequence" ? "is-active" : ""} onClick={() => onStage("sequence")}><span>1</span><ListMusic /><b>Sequence</b><small>Voice and story</small></button>
      <button className={stage === "sound" ? "is-active" : ""} onClick={() => onStage("sound")}><span>2</span><AudioLines /><b>Sound Design</b><small>Tracks and timing</small></button>
      <button className={stage === "mix" ? "is-active" : ""} onClick={() => onStage("mix")}><span>3</span><SlidersHorizontal /><b>Mix & Export</b><small>Finish and deliver</small></button>
    </nav>
    <div className="ws-header-actions">
      {issueCount > 0 && <Button variant="outline" size="sm" onClick={() => onStage("mix")}><CircleAlert className="ws-warning-icon" /> {issueCount} issue{issueCount === 1 ? "" : "s"}</Button>}
      <Button variant="outline" size="sm" disabled={previewing} onClick={onPreview}>{previewing ? <LoaderCircle className="spin" /> : playing ? <Pause /> : <Play />}{previewing ? "Preparing…" : playing ? "Pause" : "Preview"}</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus /> Add <ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onAdd("speech")}><AudioLines /> Speech</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("silence")}><Pause /> Silence</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("asset")}><Sparkles /> SFX or linked audio</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("music")}><Music2 /> Music</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onAdd("import")}><FileJson2 /> Import JSON</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More Production actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> Delete Production permanently</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div>
  </header>
}

function MixOutline({ production, music, onCollapse }: { production: Production; music: MusicBed; onCollapse: () => void }) {
  const issues = productionHealth(production.parts)
  const drafts = production.parts.filter((part) => part.kind === "draft" || part.kind === "speech" && !part.clip_id).length
  return <div className="ws-mix-outline">
    <WorkstationPaneHeader title="Release" meta="Output checklist" onCollapse={onCollapse} />
    <div className="ws-mix-step is-current"><span>1</span><div><b>Sequence</b><small>{drafts ? `${drafts} recordings missing` : "All speech recorded"}</small></div></div>
    <div className="ws-mix-step"><span>2</span><div><b>Sound</b><small>{music.filename ? "Music bed included" : "Voice only"}</small></div></div>
    <div className="ws-mix-step"><span>3</span><div><b>Quality</b><small>{issues.length ? `${issues.length} items to review` : "Ready to finish"}</small></div></div>
    <div className="ws-mix-step"><span>4</span><div><b>Exports</b><small>{production.exports.length} saved versions</small></div></div>
  </div>
}

function EmptyInspector({ stage }: { stage: WorkstationStage }) {
  const copy = stage === "sequence"
    ? ["Select a story part", "Its text, captions and technical details stay here while the full sequence remains visible."]
    : stage === "sound"
      ? ["Select a clip or track", "Choose voice, linked audio or music directly on the timeline to shape it here."]
      : ["Release inspector", "Issues and finishing evidence stay beside the output workspace."]
  return <div className="ws-empty-inspector"><span><Search /></span><h3>{copy[0]}</h3><p>{copy[1]}</p></div>
}

function ReleaseInspector({ issues, onLocate }: { issues: ProductionHealthIssue[]; onLocate: (id: number) => void }) {
  const blocking = issues.filter((issue) => issue.severity === "blocking").length
  return <div className="ws-release-inspector">
    <section className={blocking ? "has-blockers" : "is-clear"}><CircleAlert /><div><span className="ws-kicker">Release status</span><h3>{blocking ? `${blocking} blocking issue${blocking === 1 ? "" : "s"}` : "Ready to export"}</h3><p>{blocking ? "Record missing speech or restore missing media before making the final file." : "No blocking sequence issues remain."}</p></div></section>
    <div className="ws-release-issue-list">{issues.map((issue) => <button key={`${issue.part.id}:${issue.title}`} onClick={() => onLocate(issue.part.id)}><span>{formatPartNumber(issue.part.position ?? 0)}</span><div><b>{issue.title}</b><small>{formatAuthoredRole(issue.part.authored_role) || issue.detail}</small></div><i className={issue.severity} /></button>)}</div>
  </div>
}

export function ProductionWorkstationPage({ production, tree: _tree, music, assets, assetCollections, config, directory, refresh, refreshAssets }: {
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
  const player = useGlobalPlayer()
  const [stage, setStage] = useState<WorkstationStage>("sequence")
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(() => initialSelection(production))
  const [soundSelection, setSoundSelection] = useState<SoundSelection>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerPartId, setComposerPartId] = useState<number | null>(null)
  const [releaseInspectorOpen, setReleaseInspectorOpen] = useState(false)
  const [tool, setTool] = useState<ToolKind>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [captionPartId, setCaptionPartId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [deleteProductionOpen, setDeleteProductionOpen] = useState(false)
  const [movePositionPart, setMovePositionPart] = useState<ProductionPart | null>(null)
  const [replacingAsset, setReplacingAsset] = useState<ProductionPart | null>(null)
  const centerPaneRef = useRef<HTMLElement | null>(null)
  const sourceParts = useMemo(() => production.parts.filter((part) => part.kind !== "stitch"), [production.parts])
  const activeSourceParts = useMemo(() => sourceParts.filter((part) => part.enabled !== false), [sourceParts])
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
  const playSource = useCallback(async (source: PlayerSource) => player.toggleSource(await preparePlayerSource(source)), [player, preparePlayerSource])
  const actions = useProductionActions({ production, music, player, refresh, refreshAssets, preparePlayerSource, feedbackMode: "inline" })
  const duration = activeSourceParts.reduce((sum, part) => sum + partDurationMs(part), 0) / 1000
  const issues = useMemo(() => productionHealth(production.parts), [production.parts])
  const assetCollectionIds = Object.fromEntries(assetCollections.map((collection) => [collection.name, collection.id]))
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
  const closeComposer = useCallback(() => { setComposerOpen(false); setComposerPartId(null); setInsertBeforePartId(null) }, [])
  const changeStage = useCallback((next: WorkstationStage) => {
    setStage(next)
    closeComposer()
    setReleaseInspectorOpen(next === "mix")
  }, [closeComposer])
  const queueRender = useCallback((payload: GeneratePayload) => {
    const request = composerPart ? actions.recordPendingPart(composerPart, payload) : actions.generatePart(payload)
    return request.then((job) => { closeComposer(); void refresh().catch(() => undefined); return job })
  }, [actions, closeComposer, composerPart, refresh])
  const requestPartDeletion = useCallback((part: ProductionPart) => setConfirmAction({
    title: "Delete this Part permanently?",
    description: "This removes the whole story part: its text, recording and captions. Previous provider spend remains in Activity.",
    confirmLabel: "Delete Part permanently",
    kind: "delete",
    action: () => { if (player.source?.key === `part:${part.id}`) player.pause(); setSelectedId(null); void actions.deletePart(part) },
  }), [actions, player])
  const openTool = useCallback((kind: Exclude<ToolKind, null>) => {
    if (kind === "speech") { openNewSpeech(); return }
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
    addBefore: (part) => openNewSpeech(part),
  }), [actions, confirmJob, editPart, openNewSpeech, playSource, requestPartDeletion, retryJob, selectPart])

  const soundPart = soundSelection?.kind === "part" ? sourceParts.find((part) => part.id === soundSelection.id) || null : null
  const inspectorTitle = composerOpen ? (composerPart ? `Edit Part ${formatPartNumber(composerPart.position ?? 0)}` : "New speech")
    : stage === "sequence" && selectedPart ? `Part ${formatPartNumber(selectedPart.position ?? 0)} · ${formatAuthoredRole(selectedPart.authored_role) || partKindLabel(selectedPart)}`
      : stage === "sound" && soundSelection?.kind === "music" ? "Music track"
        : stage === "sound" && soundPart ? `${formatAuthoredRole(soundPart.authored_role) || soundPart.kind} · Sound`
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
  /> : stage === "sound" && soundSelection?.kind === "music" ? <MusicWorkbench
    music={music} playingKey={player.source?.key} playing={actions.playerPlaying} onPlay={(source) => void playSource(source)} onChange={actions.setMusic}
    onChoose={() => setTool("music")} onRemove={() => setConfirmAction({ title: "Remove this Music Bed?", description: "The library asset remains available. Only this Production placement is removed.", action: () => { void actions.setMusic({ music_of: null }); setSoundSelection(null) } })}
  /> : stage === "sound" && soundPart ? <WorkstationPartInspector
    productionId={production.id} part={soundPart} directory={directory} playingKey={player.source?.key} playerPlaying={actions.playerPlaying}
    onPlay={(source) => void playSource(source)} onChanged={refresh}
    onDuplicate={(part) => void actions.duplicatePart(part)} onDelete={requestPartDeletion} onEdit={editPart} onOpenCaptions={(part) => setCaptionPartId(part.id)} onReplaceAsset={openAssetReplacement}
  /> : stage === "mix" && releaseInspectorOpen ? <ReleaseInspector issues={issues} onLocate={(id) => { setStage("sequence"); setSelectedId(id); setReleaseInspectorOpen(false); requestAnimationFrame(() => document.getElementById(`ws-part-${id}`)?.scrollIntoView({ block: "center" })) }} /> : <EmptyInspector stage={stage} />

  const inspectorOpen = composerOpen || stage === "sequence" && Boolean(selectedPart) || stage === "sound" && Boolean(soundSelection) || stage === "mix" && releaseInspectorOpen
  const outlineLabel = stage === "sequence" ? "outline" : stage === "sound" ? "tracks" : "release checklist"
  const closeInspector = () => {
    if (composerOpen) { closeComposer(); return }
    if (stage === "sequence") setSelectedId(null)
    else if (stage === "sound") setSoundSelection(null)
    else setReleaseInspectorOpen(false)
  }

  const overlaysOpen = Boolean(tool || confirmAction)
  usePlayerShortcuts(
    { hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek },
    () => {
      setTool(null); setConfirmAction(null); setCaptionPartId(null); setMovePositionPart(null); setReplacingAsset(null)
      if (composerOpen) closeComposer()
    },
  )
  return <>
    <section className="production-workstation" data-stage={stage} data-outline-open={outlineOpen ? "true" : "false"} data-inspector-open={inspectorOpen ? "true" : "false"} data-inspector-expanded={composerOpen ? "true" : "false"}>
      <WorkstationHeader production={production} duration={duration} stage={stage} issueCount={issues.length} previewing={actions.previewing} playing={actions.productionPlaying} mutationStatus={actions.mutationStatus} onStage={changeStage} onPreview={actions.toggleProduction} onAdd={openTool} onDelete={() => setDeleteProductionOpen(true)} onRename={renameProduction} />
      <div className="ws-body">
        <aside className={cn("ws-left-pane", !outlineOpen && "is-collapsed")} aria-label={`${stage} navigation`}>
          {outlineOpen ? <>
            {stage === "sequence" && <WorkstationOutline parts={sourceParts} selectedId={selectedId} directory={directory} onSelect={selectPart} onCollapse={() => setOutlineOpen(false)} />}
            {stage === "sound" && <SoundDesignOutline music={music} parts={sourceParts} selection={soundSelection} onSelection={setSoundSelection} onAddSound={() => setTool("asset")} onCollapse={() => setOutlineOpen(false)} />}
            {stage === "mix" && <MixOutline production={production} music={music} onCollapse={() => setOutlineOpen(false)} />}
          </> : <Button className="ws-pane-expand" variant="ghost" size="icon-sm" aria-label={`Show ${outlineLabel}`} title={`Show ${outlineLabel}`} onClick={() => setOutlineOpen(true)}><PanelLeftOpen /></Button>}
        </aside>
        <main className="ws-center-pane" ref={centerPaneRef}>
          {stage === "sequence" && <WorkstationSequence parts={sourceParts} selectedId={selectedId} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} liveJobs={liveJobs} directory={directory} actions={partActions} onAddEnd={() => openNewSpeech()} />}
          {stage === "sound" && <WorkstationSoundDesign parts={sourceParts} music={music} selection={soundSelection} onSelection={setSoundSelection} onAddSound={() => setTool("asset")} />}
          {stage === "mix" && <div className="ws-mix-canvas"><MixExportWorkspace production={production} music={music} previewing={actions.previewing} productionPlaying={actions.productionPlaying} previewReady={actions.productionLoaded} previewStale={Boolean(player.source?.kind === "production" && !actions.productionLoaded)} exportJob={actions.exportJob} onPreview={actions.toggleProduction} onExport={() => void actions.exportMp3()} onLocatePart={(id) => { setStage("sequence"); setSelectedId(id) }} onOpenHealth={() => setReleaseInspectorOpen(true)} exporting={actions.exporting} /></div>}
        </main>
        {inspectorOpen && <aside className="ws-right-pane" aria-label="Contextual inspector">
          <header><h2>{inspectorTitle}</h2><Button variant="ghost" size="icon-sm" aria-label="Close inspector" onClick={closeInspector}><X /></Button></header>
          <div className="ws-inspector-content">{inspector}</div>
        </aside>}
      </div>
      <ProductionFloatingTransport
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
    {overlaysOpen && <Suspense fallback={null}><ProductionOverlays
      tool={tool} productionId={production.id} nextPartNumber={sourceParts.length + 1} insertAt={composerInsertAt} insertBeforePartId={insertBeforePartId}
      composerPart={null} replacingAssetId={replacingAsset?.asset_id} initialMusicAssetId={music.music_of} config={config} directory={directory} assets={assets} assetCollectionIds={assetCollectionIds}
      playingKey={player.source?.key} playerPlaying={actions.playerPlaying} confirmAction={confirmAction}
      onCloseTool={() => { setTool(null); setReplacingAsset(null) }} onSaveDraft={actions.saveDraft} onUpdateEditorial={async () => undefined} onGenerate={queueRender}
      onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertBeforePartId); setTool(null) }}
      onInsertAsset={async (asset) => { if (replacingAsset) await actions.replaceAsset(replacingAsset, asset); else await actions.insertAsset(asset, insertBeforePartId); setTool(null); setReplacingAsset(null) }}
      onSetMusic={async (asset) => { await actions.setMusicAsset(asset); setTool(null); setStage("sound"); setSoundSelection({ kind: "music" }) }}
      onUploadAsset={async (folder, file) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); await actions.uploadAsset(collectionId, folder, file) }}
      onImport={(document, roleVoices) => studioApi.importProduction(production.id, document, roleVoices)} onImported={() => { actions.invalidatePreview(); void refresh().then(() => setTool(null)) }}
      onPlay={(source) => void playSource(source)} onConfirmAction={setConfirmAction}
    /></Suspense>}
  </>
}
