import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AudioLines, Check, ChevronDown, ChevronRight, CircleAlert, FileJson2,
  ListMusic, LoaderCircle, MoreHorizontal, Music2, Pause, PencilLine, Play, Plus, Search,
  PanelLeftOpen, SlidersHorizontal, Sparkles, Trash2, X,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { DeleteProductionDialog } from "@/components/delete-production-dialog"
import { AudioStudioRailToggle } from "@/components/app-shell"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { PartCaptionsDialog } from "@/features/production/part-captions-dialog"
import { MovePartPositionDialog } from "@/features/production/move-part-position-dialog"
import { ProductionComposerStage } from "@/features/composer/production-composer-host"
import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import { MusicInspector } from "@/features/sound-scene/inspector/music-inspector"
import { SequenceMixInspector } from "@/features/sound-scene/inspector/sequence-mix-inspector"
import { audibleMusicClips } from "@/features/sound-scene/sound-scene-audibility"
import { SoundSceneWorkspace } from "@/features/sound-scene/timeline/sound-scene-workspace"
import { SoundSceneSession, useSoundSceneSession, type SoundScenePersistence } from "@/features/sound-scene/engine/sound-scene-session"
import { ProductionFloatingTransport } from "@/features/production/production-floating-transport"
import { productionHealth, type ProductionHealthIssue } from "@/features/production/production-health-sheet"
import { useProductionSpeechJobs } from "@/features/production/use-production-speech-jobs"
import type { ConfirmAction } from "@/features/production/production-overlays"
import type { ToolKind } from "@/components/production-tools"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useProductionActions } from "@/hooks/use-production-actions"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import type { ProductionMutationStatus } from "@/hooks/use-production-actions"
import { audioStudioBase, resourceHref } from "@/lib/links"
import { formatAuthoredRole, formatDuration, formatMoney, formatPartNumber } from "@/lib/format"
import { loadPartCaptionTracks, loadProductionCaptionTracks } from "@/lib/production-caption-tracks"
import { studioApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type {
  AssetCollection, DurableJob, GeneratePayload, GenerateResult, HierarchyNode, PlayerCaptionTrack,
  PlayerSource, Production, ProductionPart, SoundScene, StudioConfig, VentureAsset, VoiceDirectory,
} from "@/types/domain"
import { WorkstationOutline, WorkstationSequence, workstationPartState, type WorkstationPartActions, type WorkstationPartState } from "./workstation-sequence"
import { WorkstationPartInspector } from "./workstation-part-inspector"
import { WorkstationPaneHeader } from "./workstation-pane-header"

import "./production-workstation.css"

const ProductionOverlays = lazy(() => import("@/features/production/production-overlays"))

type WorkstationStage = "sequence" | "sound" | "mix"
type MusicTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string } | { mode: "replace"; trackId: string; clipId: string }

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

function ProductionParentSwitcher({ production, tree }: { production: Production; tree: HierarchyNode[] | null }) {
  const parent = production.trail.at(-1)
  if (!parent) return <Link className="ws-parent-link" to={`${audioStudioBase}/projects/${production.project_id}`}>Project</Link>
  const parentNode = tree?.find((item) => item.type === parent.type && item.id === parent.id)
  const peers = parentNode
    ? (tree || []).filter((item) => item.type === parent.type && item.parent_key === parentNode.parent_key)
      .sort((left, right) => left.name.localeCompare(right.name))
    : []
  const options = peers.length ? peers : [parent]
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="ws-parent-switcher" aria-label={`Switch ${parent.type}`}>
        <span>{parent.name}</span><ChevronDown aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="ws-parent-menu">
      <DropdownMenuLabel>Switch {parent.type}</DropdownMenuLabel>
      {options.map((item) => {
        const current = item.id === parent.id
        return <DropdownMenuItem key={`${item.type}:${item.id}`} asChild>
          <Link to={resourceHref(item.type, item.public_id)}><span>{item.name}</span>{current && <Check aria-label="Current" />}</Link>
        </DropdownMenuItem>
      })}
    </DropdownMenuContent>
  </DropdownMenu>
}

function WorkstationHeader({ production, tree, duration, stage, issueCount, previewing, playing, mutationStatus, onStage, onPreview, onAdd, onDelete, onRename }: {
  production: Production
  tree: HierarchyNode[] | null
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
  return <header className="ws-header">
    <div className="ws-header-context">
      <AudioStudioRailToggle className="ws-shell-toggle" tooltipSide="bottom" />
      <ProductionParentSwitcher production={production} tree={tree} />
      <ChevronRight className="ws-breadcrumb-separator" aria-hidden="true" />
      <InlineProductionName name={production.name} onRename={onRename} />
      <dl><div><dt>Parts</dt><dd>{production.parts.filter((part) => part.kind !== "stitch").length}</dd></div><div><dt>Duration</dt><dd>{formatDuration(duration)}</dd></div><div><dt title="Cost of audio currently active in this Sequence">Current cost</dt><dd>{formatMoney(production.current_sequence_cost)}</dd></div></dl>
      {production.status && production.status !== "draft" && <span className="ws-status">{production.status.replaceAll("_", " ")}</span>}
      {mutationStatus !== "idle" && <span className={`ws-save-state is-${mutationStatus}`} role="status" aria-live="polite">{mutationStatus === "saving" ? <LoaderCircle className="spin" /> : <Check />}{mutationStatus === "saving" ? "Saving…" : "Saved"}</span>}
    </div>
    <nav className="ws-workflow" aria-label="Production workflow">
      <button className={stage === "sequence" ? "is-active" : ""} onClick={() => onStage("sequence")}><span>1</span><ListMusic /><b>Sequence</b><small>Voice and story</small></button>
      <button className={stage === "sound" ? "is-active" : ""} onClick={() => onStage("sound")}><span>2</span><AudioLines /><b>Sound Design</b><small>Tracks and timing</small></button>
      <button className={stage === "mix" ? "is-active" : ""} onClick={() => onStage("mix")}><span>3</span><SlidersHorizontal /><b>Mix & Export</b><small>Finish and deliver</small></button>
    </nav>
    <div className="ws-header-actions">
      <div className="ws-action-buttons">
        {issueCount > 0 && <Button variant="outline" size="sm" onClick={() => onStage("mix")}><CircleAlert className="ws-warning-icon" /> {issueCount} issue{issueCount === 1 ? "" : "s"}</Button>}
        <Button variant="outline" size="sm" disabled={previewing} onClick={onPreview}>{previewing ? <LoaderCircle className="spin" /> : playing ? <Pause /> : <Play />}{previewing ? "Preparing…" : playing ? "Pause" : "Preview"}</Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus /> Add <ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onAdd("speech")}><AudioLines /> Speech</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("silence")}><Pause /> Silence</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("asset")}><Sparkles /> Linked audio</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("music")}><Music2 /> Music</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onAdd("import")}><FileJson2 /> Import JSON</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <DropdownMenu><OperatorTooltip label="More Production actions" detail="Contains permanent Production deletion."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More Production actions"><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> Delete Production permanently</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </div>
  </header>
}

function CollapsedPaneSummary({ label, number, state, playing, onExpand }: {
  label: string
  number: string
  state: WorkstationPartState
  playing: boolean
  onExpand: () => void
}) {
  return <div className="ws-collapsed-pane">
    <OperatorTooltip label={`Show ${label}`} side="right"><Button className="ws-pane-expand" variant="ghost" size="icon-sm" aria-label={`Show ${label}`} onClick={onExpand}><PanelLeftOpen /></Button></OperatorTooltip>
    <span className={cn("ws-collapsed-context", playing && "is-playing")} title={playing ? `${label} ${number} is playing` : `${label} ${number}`}>
      <b>{number}</b>
      <i className={`is-${state}`} />
      {playing && <AudioLines aria-hidden="true" />}
    </span>
  </div>
}

function MixOutline({ production, soundScene, onCollapse }: { production: Production; soundScene: SoundScene; onCollapse: () => void }) {
  const issues = productionHealth(production.parts)
  const staleOverrides = soundScene.resolved.orphans.filter((orphan) => orphan.kind === "sequence_override").length
  const drafts = production.parts.filter((part) => part.kind === "draft" || part.kind === "speech" && !part.clip_id).length
  const linkedSounds = production.parts.filter((part) => part.kind === "asset" && part.enabled !== false).length
  const musicClips = audibleMusicClips(soundScene).length
  const musicLabel = `${musicClips} Music clip${musicClips === 1 ? "" : "s"}`
  const soundSummary = musicClips
    ? linkedSounds ? `${musicLabel} + ${linkedSounds} linked sound${linkedSounds === 1 ? "" : "s"}` : musicLabel
    : linkedSounds ? `${linkedSounds} linked sound${linkedSounds === 1 ? "" : "s"}` : "Voice only"
  return <div className="ws-mix-outline">
    <WorkstationPaneHeader title="Release" meta="Output checklist" onCollapse={onCollapse} />
    <div className="ws-mix-step is-current"><span>1</span><div><b>Sequence</b><small>{drafts ? `${drafts} planned for later` : "All speech recorded"}</small></div></div>
    <div className="ws-mix-step"><span>2</span><div><b>Sound</b><small>{soundSummary}</small></div></div>
    <div className="ws-mix-step"><span>3</span><div><b>Quality</b><small>{issues.length + staleOverrides ? `${issues.length + staleOverrides} items to review` : "Ready to finish"}</small></div></div>
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

function MusicGroupInspector({ count }: { count: number }) {
  return <div className="ws-empty-inspector">
    <span><ListMusic /></span>
    <h3>{count} Music clips selected</h3>
    <p>Drag any selected clip to move the group together. Shared mute, lock, duplicate and remove actions stay in the toolbar.</p>
  </div>
}

function ReleaseInspector({ issues, staleOverrides, onLocate, onRemoveOverride }: {
  issues: ProductionHealthIssue[]
  staleOverrides: string[]
  onLocate: (id: number) => void
  onRemoveOverride: (partPublicId: string) => void
}) {
  const blocking = issues.filter((issue) => issue.severity === "blocking").length
  const review = issues.length - blocking + staleOverrides.length
  return <div className="ws-release-inspector">
    <section className={blocking ? "has-blockers" : review ? "has-review" : "is-clear"}><CircleAlert /><div><span className="ws-kicker">Release status</span><h3>{blocking ? `${blocking} blocking issue${blocking === 1 ? "" : "s"}` : review ? `${review} item${review === 1 ? "" : "s"} to review` : "Ready to export"}</h3><p>{blocking ? "Restore missing or broken media before making the final file." : review ? "These states do not silently block export, but remain explicit." : "No blocking audio issues remain."}</p></div></section>
    <div className="ws-release-issue-list">{issues.map((issue) => <button key={`${issue.part.id}:${issue.title}`} onClick={() => onLocate(issue.part.id)}><span>{formatPartNumber(issue.part.position ?? 0)}</span><div><b>{issue.title}</b><small>{formatAuthoredRole(issue.part.authored_role) || issue.detail}</small></div><i className={issue.severity} /></button>)}
      {staleOverrides.map((partPublicId) => <div className="ws-release-stale-override" key={partPublicId}><span><SlidersHorizontal /></span><div><b>Obsolete Sequence mix override</b><small>Its original Part no longer exists. It is not applied to another Part.</small></div><Button variant="ghost" size="sm" onClick={() => onRemoveOverride(partPublicId)}><Trash2 /> Remove</Button></div>)}
    </div>
  </div>
}

export function ProductionWorkstationPage({ production, tree, soundScene, assets, assetCollections, config, directory, refresh, refreshAssets }: {
  production: Production
  tree: HierarchyNode[] | null
  soundScene: SoundScene
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
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerPartId, setComposerPartId] = useState<number | null>(null)
  const [releaseInspectorOpen, setReleaseInspectorOpen] = useState(false)
  const [tool, setTool] = useState<ToolKind>(null)
  const [musicTarget, setMusicTarget] = useState<MusicTarget | null>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [captionPartId, setCaptionPartId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [deleteProductionOpen, setDeleteProductionOpen] = useState(false)
  const [movePositionPart, setMovePositionPart] = useState<ProductionPart | null>(null)
  const [replacingAsset, setReplacingAsset] = useState<ProductionPart | null>(null)
  const centerPaneRef = useRef<HTMLElement | null>(null)
  const soundSessionRef = useRef<SoundSceneSession | null>(null)
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
    update: (document) => soundPersistence.current.update(document),
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
  const duration = Number(soundScene.resolved.duration_ms ?? soundScene.resolved.sequence_projection.duration_ms) / 1000
  const issues = useMemo(() => productionHealth(production.parts), [production.parts])
  const staleOverrides = useMemo(() => soundState.scene.resolved.orphans.flatMap((orphan) =>
    orphan.kind === "sequence_override" && orphan.part_public_id ? [orphan.part_public_id] : []), [soundState.scene.resolved.orphans])
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
      ? "This removes this linked-audio Part from the Sequence. The reusable Venture asset remains available."
      : part.kind === "silence"
        ? "This permanently removes this Silence Part from the Sequence."
        : "This removes the whole story part: its text, recording and captions. Previous provider spend remains in Activity.",
    confirmLabel: "Delete Part permanently",
    kind: "confirm",
    action: () => { if (player.source?.key === `part:${part.id}`) player.pause(); setSelectedId(null); void actions.deletePart(part) },
  }), [actions, player])
  const requestExport = useCallback(() => {
    if (!pendingDraftCount) { void actions.exportMp3(); return }
    setConfirmAction({
      title: "Export the recorded audio?",
      description: `${pendingDraftCount} planned Speech Part${pendingDraftCount === 1 ? " has" : "s have"} no recording yet. They stay safely in Sequence and will not be included in this MP3.`,
      confirmLabel: "Export recorded audio",
      kind: "confirm",
      variant: "default",
      action: () => { void actions.exportMp3(true) },
    })
  }, [actions, pendingDraftCount])
  const openTool = useCallback((kind: Exclude<ToolKind, null>) => {
    if (kind === "speech") { openNewSpeech(); return }
    if (kind === "music") setMusicTarget({ mode: "new-track" })
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
    addBefore: (part) => openNewSpeech(part),
  }), [actions, confirmJob, editPart, openAssetReplacement, openNewSpeech, playSource, requestPartDeletion, retryJob, selectPart])

  const soundSelection = soundState.selection
  const soundPart = soundSelection?.kind === "part" ? sourceParts.find((part) => part.id === soundSelection.id) || null : null
  const soundSpan = soundSelection?.kind === "part"
    ? soundState.scene.resolved.sequence_projection.spans.find((span) => span.part_id === soundSelection.id) || null
    : null
  const resolvedMusicTrack = soundSelection?.kind === "clip"
    ? soundState.scene.resolved.tracks.find((track) => track.id === soundSelection.trackId) || null
    : null
  const engineMusicTrack = resolvedMusicTrack ? soundState.engine.tracks.find((track) => track.id === resolvedMusicTrack.id) : null
  const musicTrack = resolvedMusicTrack ? {
    ...resolvedMusicTrack,
    volume: engineMusicTrack?.volume ?? resolvedMusicTrack.volume,
    muted: engineMusicTrack?.muted ?? resolvedMusicTrack.muted,
  } : null
  const musicClip = soundSelection?.kind === "clip"
    ? soundSession.currentClip(soundSelection.trackId, soundSelection.clipId)
    : null
  const musicClipName = musicClip?.asset_name || "Music clip"
  const playingPart = actions.playerPlaying && player.source?.key.startsWith("part:")
    ? sourceParts.find((part) => part.id === Number(player.source?.key.slice(5))) || null
    : null
  const inspectorTitle = composerOpen ? (composerPart ? `Edit Part ${formatPartNumber(composerPart.position ?? 0)}` : "New speech")
    : stage === "sequence" && selectedPart ? `Part ${formatPartNumber(selectedPart.position ?? 0)} · ${formatAuthoredRole(selectedPart.authored_role) || partKindLabel(selectedPart)}`
      : stage === "sound" && soundSelection?.kind === "clip" ? "Music clip"
        : stage === "sound" && soundSelection?.kind === "clips" ? `${soundSelection.clips.length} Music clips`
        : stage === "sound" && soundSpan ? `${soundSpan.role || soundSpan.voice_name || "Sequence Part"} · Mix`
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
  /> : stage === "sound" && soundSelection?.kind === "clip" && musicTrack ? <MusicInspector
    track={musicTrack} clip={musicClip} playingKey={player.source?.key} playing={actions.playerPlaying} onPlay={(source) => void playSource(source)}
    onClipChange={(changes) => { if (musicClip) soundSession.updateClip(musicTrack.id, musicClip.id, changes) }} onClipCommit={() => soundSession.commitClip()}
    onTrackVolumeChange={(volume) => soundSession.setTrackVolume(musicTrack.id, volume)} onTrackVolumeCommit={(volume) => soundSession.commitTrackVolume(musicTrack.id, volume)}
    onChoose={() => { setMusicTarget({ mode: "replace", trackId: soundSelection.trackId, clipId: soundSelection.clipId }); setTool("music") }} onRemove={() => setConfirmAction({ title: `Remove “${musicClipName}”?`, description: "The reusable Venture asset remains available. Only this Sound Scene placement is removed.", action: () => { void soundSession.removeClip(soundSelection.trackId, soundSelection.clipId) } })}
  /> : stage === "sound" && soundSpan ? <SequenceMixInspector
    span={soundSpan} saving={soundState.saving}
    onPreview={(changes) => soundSession.previewSequenceOverride(soundSpan.part_public_id, changes)}
    onCommit={(changes) => soundSession.updateSequenceOverride(soundSpan.part_public_id, changes)}
    onOpenSequence={() => { soundSession.select(null); setStage("sequence"); setSelectedId(soundSpan.part_id) }}
  /> : stage === "sound" && soundSelection?.kind === "clips" ? <MusicGroupInspector count={soundSelection.clips.length} />
    : stage === "mix" && releaseInspectorOpen ? <ReleaseInspector
    issues={issues} staleOverrides={staleOverrides}
    onLocate={(id) => { setStage("sequence"); setSelectedId(id); setReleaseInspectorOpen(false); requestAnimationFrame(() => document.getElementById(`ws-part-${id}`)?.scrollIntoView({ block: "center" })) }}
    onRemoveOverride={(partPublicId) => { void soundSession.removeSequenceOverride(partPublicId) }}
  /> : <EmptyInspector stage={stage} />

  const inspectorOpen = composerOpen || stage === "sequence" && Boolean(selectedPart) || stage === "sound" && Boolean(soundSelection) || stage === "mix" && releaseInspectorOpen
  const outlineLabel = stage === "sequence" ? "outline" : stage === "sound" ? "tracks" : "release checklist"
  const collapsedPart = playingPart || (stage === "sequence" ? selectedPart : stage === "sound" ? soundPart : null)
  const collapsedState = collapsedPart ? workstationPartState(collapsedPart) : issues.length || staleOverrides.length ? "issue" : sourceParts.some((part) => workstationPartState(part) === "draft") ? "draft" : "ready"
  const collapsedNumber = collapsedPart
    ? formatPartNumber(collapsedPart.position ?? sourceParts.indexOf(collapsedPart))
    : String(stage === "sequence" ? sourceParts.length : stage === "sound" ? 3 : issues.length + staleOverrides.length)
  const closeInspector = () => {
    if (composerOpen) { closeComposer(); return }
    if (stage === "sequence") setSelectedId(null)
    else if (stage === "sound") soundSession.select(null)
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
        {stage !== "sound" && <aside className={cn("ws-left-pane", !outlineOpen && "is-collapsed")} aria-label={`${stage} navigation`}>
          {outlineOpen ? <>
            {stage === "sequence" && <WorkstationOutline parts={sourceParts} selectedId={selectedId} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} directory={directory} onSelect={selectPart} onCollapse={() => setOutlineOpen(false)} />}
            {stage === "mix" && <MixOutline production={production} soundScene={soundScene} onCollapse={() => setOutlineOpen(false)} />}
          </> : <CollapsedPaneSummary label={outlineLabel} number={collapsedNumber} state={collapsedState} playing={Boolean(playingPart)} onExpand={() => setOutlineOpen(true)} />}
        </aside>}
        <main className="ws-center-pane" ref={centerPaneRef}>
          {stage === "sequence" && <WorkstationSequence parts={sourceParts} selectedId={selectedId} playingKey={player.source?.key} playerPlaying={actions.playerPlaying} liveJobs={liveJobs} directory={directory} actions={partActions} onAddEnd={() => openNewSpeech()} />}
          {stage === "sound" && <SoundSceneWorkspace
            session={soundSession}
            onAddMusic={(target) => { setMusicTarget(target); setTool("music") }}
            onRemoveClip={({ clips }) => {
              const names = clips.flatMap((ref) => {
                const clip = soundState.scene.resolved.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
                return clip ? [clip.asset_name || "Music clip"] : []
              })
              setConfirmAction({
                title: clips.length === 1 ? `Remove this clip: “${names[0] || "Music clip"}”?` : `Remove ${clips.length} selected Music clips?`,
                description: "Reusable Venture assets remain available. Only the selected Sound Scene placements are removed.",
                action: () => { void soundSession.removeClips(clips) },
              })
            }}
            onRemoveTrack={(track) => setConfirmAction({
              title: `Remove this track: “${track.name}”?`,
              description: `This removes the track and its ${track.clips.length} placement${track.clips.length === 1 ? "" : "s"}. Reusable Venture assets remain available.`,
              action: () => { void soundSession.removeTrack(track.id) },
            })}
            onOpenSequence={(partId) => { setStage("sequence"); setSelectedId(partId) }}
          />}
          {stage === "mix" && <div className="ws-mix-canvas"><MixExportWorkspace production={production} soundScene={soundScene} previewing={actions.previewing} productionPlaying={actions.productionPlaying} previewReady={actions.productionLoaded} previewStale={Boolean(player.source?.kind === "production" && !actions.productionLoaded)} exportJob={actions.exportJob} onPreview={actions.toggleProduction} onExport={requestExport} onLocatePart={(id) => { setStage("sequence"); setSelectedId(id) }} onOpenHealth={() => setReleaseInspectorOpen(true)} exporting={actions.exporting} /></div>}
        </main>
        {inspectorOpen && <aside className="ws-right-pane" aria-label="Contextual inspector">
          <header><h2>{inspectorTitle}</h2><Button variant="ghost" size="icon-sm" aria-label="Close inspector" onClick={closeInspector}><X /></Button></header>
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
    {overlaysOpen && <Suspense fallback={null}><ProductionOverlays
      tool={tool} productionId={production.id} nextPartNumber={sourceParts.length + 1} insertAt={composerInsertAt} insertBeforePartId={insertBeforePartId}
      composerPart={null} replacingAssetId={replacingAsset?.asset_id} initialMusicAssetId={musicClip?.asset_id} config={config} directory={directory} assets={assets} assetCollectionIds={assetCollectionIds}
      playingKey={player.source?.key} playerPlaying={actions.playerPlaying} confirmAction={confirmAction}
      onCloseTool={() => { setTool(null); setReplacingAsset(null); setMusicTarget(null) }} onSaveDraft={actions.saveDraft} onUpdateEditorial={async () => undefined} onGenerate={queueRender}
      onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertBeforePartId); setTool(null) }}
      onInsertAsset={async (asset) => { if (replacingAsset) await actions.replaceAsset(replacingAsset, asset); else await actions.insertAsset(asset, insertBeforePartId); setTool(null); setReplacingAsset(null) }}
      onSetMusic={async (asset) => {
        if (musicTarget?.mode === "replace") await soundSession.replaceClipSource(musicTarget.trackId, musicTarget.clipId, asset)
        else if (musicTarget?.mode === "add-clip") await soundSession.addClip(musicTarget.trackId, asset, soundSession.snapshot().playhead)
        else await soundSession.addTrack("music", asset, soundSession.snapshot().playhead)
        setTool(null); setMusicTarget(null); setStage("sound")
      }}
      onUploadAsset={async (folder, file) => { const collectionId = assetCollectionIds[folder]; if (!collectionId) throw new Error(`${folder} library is unavailable.`); await actions.uploadAsset(collectionId, folder, file) }}
      onImport={(document, roleVoices) => studioApi.importProduction(production.id, document, roleVoices)} onImported={() => { actions.invalidatePreview(); void refresh().then(() => setTool(null)) }}
      onPlay={(source) => void playSource(source)} onConfirmAction={setConfirmAction}
    /></Suspense>}
  </>
}
