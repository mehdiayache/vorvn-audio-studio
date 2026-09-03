import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { DeleteProjectDialog } from "@/features/projects/audiovisual/delete-project-dialog"
import { OperatorIconButton } from "@/components/operator-action"
import { PartCaptionsDialog } from "@/features/projects/audiovisual/support/part-captions-dialog"
import { MovePartPositionDialog } from "@/features/projects/audiovisual/support/move-part-position-dialog"
import { ProjectSpeechCreatorStage } from "@/features/creator/speech/project-speech-creator-host"
import { AudioClipInspector } from "@/features/sound-scene/inspector/music-inspector"
import { SequenceMixInspector } from "@/features/sound-scene/inspector/sequence-mix-inspector"
import { SoundSceneSession, soundTrackDisplayName, useSoundSceneSession, type SoundScenePersistence } from "@/features/sound-scene/engine/sound-scene-session"
import { SOUND_MEDIA_LABELS, soundClipMediaKind } from "@/features/sound-scene/sound-media-icon"
import { VisualSceneSession, useVisualSceneSession, visualSelectionRefs } from "@/features/visual-scene/engine/visual-scene-session"
import { videoHasEmbeddedAudio } from "@/features/sound-scene/engine/video-audio-sync"
import { visualTrackDisplayName } from "@/features/visual-scene/timeline/visual-timeline-parts"
import { ProjectFloatingTransport } from "@/features/projects/audiovisual/support/project-floating-transport"
import { projectHealth } from "@/features/projects/audiovisual/support/project-health-sheet"
import { useProjectSpeechJobs } from "@/features/projects/audiovisual/support/use-project-speech-jobs"
import ProjectOverlays, { type ConfirmAction } from "@/features/projects/audiovisual/support/project-overlays"
import type { ProjectToolKind } from "@/features/projects/audiovisual/project-tools"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useProjectActions } from "@/hooks/use-project-actions"
import { usePlayerShortcuts } from "@/hooks/use-player-shortcuts"
import type { ProjectFileResources } from "@/hooks/use-project-resources"
import { originsBase } from "@/lib/links"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import { loadPartCaptionTracks, loadProjectCaptionTracks } from "@/lib/project-caption-tracks"
import { originsApi } from "@/lib/api"
import type {
  DurableJob, GeneratePayload, GenerateResult, LoadState, PlayerCaptionTrack,
  PlayerSource, Project, ProjectPart, SoundScene, StudioConfig, WorkspaceFile, WorkspaceFolder, VisualScene, VoiceDirectory,
} from "@/types/domain"
import { workstationPartState, type SequenceInsertKind, type WorkstationPartActions } from "./workstation-sequence"
import { WorkstationPartInspector } from "./workstation-part-inspector"
import { ProjectLibraryStage } from "./library/project-library-stage"
import { ExportDialog } from "./export/export-stage"
import { ScriptStage } from "./script/script-stage"
import { TimelineStage } from "./timeline/timeline-stage"
import { projectTimelineDurationMs } from "./timeline/timeline-duration"
import { VisualClipInspector } from "./timeline/visual-clip-inspector"
import { WorkstationHeader } from "./workstation-header"
import { AudioGroupInspector, EmptyInspector } from "./workstation-stage-support"
import type { WorkstationStage } from "./workstation-workflow"

import "./audiovisual-project.css"

type AudioTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string } | { mode: "replace"; trackId: string; clipId: string }

function initialSelection(project: Project) {
  if (typeof window !== "undefined") {
    const key = new URL(window.location.href).searchParams.get("part")
    const found = key && project.parts.find((part) => part.public_id === key || String(part.id) === key)
    if (found) return found.id
  }
  return null
}

function partKindLabel(part: ProjectPart) {
  if (part.kind === "draft") return "Speech draft"
  if (part.kind === "file") return "Linked audio"
  return part.kind.charAt(0).toUpperCase() + part.kind.slice(1).replaceAll("_", " ")
}

function partDeletionLabel(part: ProjectPart) {
  const number = formatPartNumber(part.position ?? 0)
  if (part.kind === "silence") return `Part ${number} · Pause`
  if (part.kind === "file") return `Part ${number} · ${part.title || "Linked audio"}`
  return `Part ${number} · ${formatAuthoredRole(part.authored_role) || part.voice_name || part.voice || "Speech"}`
}

export function AudiovisualProjectPage({ project, soundScene, visualScene, folders, files, projectFileIds, libraryFileIds, fileState, config, directory, refresh, refreshFiles }: {
  project: Project
  soundScene: SoundScene
  visualScene: VisualScene
  folders: WorkspaceFolder[]
  files: WorkspaceFile[]
  projectFileIds: number[]
  libraryFileIds: number[]
  fileState: LoadState<ProjectFileResources>
  config: StudioConfig | null
  directory: VoiceDirectory
  refresh: () => Promise<void>
  refreshFiles: () => Promise<void>
}) {
  const navigate = useNavigate()
  const player = useGlobalPlayer()
  const [stage, setStage] = useState<WorkstationStage>("sequence")
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [libraryCreatorOpen, setLibraryCreatorOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(() => initialSelection(project))
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [creatorPartId, setCreatorPartId] = useState<number | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [tool, setTool] = useState<ProjectToolKind>(null)
  const [audioTarget, setAudioTarget] = useState<AudioTarget | null>(null)
  const [insertBeforePartId, setInsertBeforePartId] = useState<string | null>(null)
  const [captionPartId, setCaptionPartId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [movePositionPart, setMovePositionPart] = useState<ProjectPart | null>(null)
  const [replacingFile, setReplacingFile] = useState<ProjectPart | null>(null)
  const centerPaneRef = useRef<HTMLElement | null>(null)
  const soundSessionRef = useRef<SoundSceneSession | null>(null)
  const visualPersistence = useRef((document: VisualScene["document"], expectedRevision: number) => originsApi.updateVisualScene(project.id, expectedRevision, document))
  const sourceParts = useMemo(() => project.parts.filter((part) => part.kind !== "stitch"), [project.parts])
  const activeSourceParts = useMemo(() => sourceParts.filter((part) => part.enabled !== false), [sourceParts])
  const pendingDraftCount = useMemo(() => activeSourceParts.filter((part) => part.kind === "draft").length, [activeSourceParts])
  const selectedPart = selectedId ? sourceParts.find((part) => part.id === selectedId) || null : null
  const creatorPart = creatorPartId ? sourceParts.find((part) => part.id === creatorPartId) || null : null
  const captionPart = captionPartId ? sourceParts.find((part) => part.id === captionPartId) || null : null
  const liveJobs = useProjectSpeechJobs(project.parts, refresh)
  const captionTrackCache = useRef(new Map<string, Promise<PlayerCaptionTrack[]>>())
  useEffect(() => captionTrackCache.current.clear(), [project.id, project.parts])
  const preparePlayerSource = useCallback(async (source: PlayerSource) => {
    if (source.captionTracks?.length) return source
    const part = source.kind === "clip" && source.key.startsWith("part:") ? sourceParts.find((item) => item.id === Number(source.key.slice(5))) : null
    const key = source.kind === "project" ? `project:${project.id}` : part ? `part:${part.id}` : ""
    if (!key) return source
    try {
      const request = captionTrackCache.current.get(key) || (part ? loadPartCaptionTracks(project.id, part) : loadProjectCaptionTracks(project.id, activeSourceParts))
      captionTrackCache.current.set(key, request)
      return { ...source, captionTracks: await request }
    } catch {
      captionTrackCache.current.delete(key)
      return source
    }
  }, [activeSourceParts, project.id, sourceParts])
  const playSource = useCallback(async (source: PlayerSource) => {
    soundSessionRef.current?.pause()
    await player.toggleSource(await preparePlayerSource(source))
  }, [player, preparePlayerSource])
  const actions = useProjectActions({ project: project, soundScene, player, refresh, refreshFiles, preparePlayerSource, feedbackMode: "inline" })
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
    update: (document, expectedRevision, mutationKind) => soundPersistence.current.update(document, expectedRevision, mutationKind),
    undo: () => soundPersistence.current.undo(),
    redo: () => soundPersistence.current.redo(),
  }, undefined, () => player.pause()), [project.id])
  soundSessionRef.current = soundSession
  const soundState = useSoundSceneSession(soundSession)
  useEffect(() => { soundSession.reconcile(soundScene) }, [soundScene, soundSession])
  useEffect(() => () => soundSession.dispose(), [soundSession])
  useEffect(() => {
    if (stage === "sound") void soundSession.activatePlayout()
    else soundSession.deactivatePlayout()
  }, [soundSession, stage])
  const initialDurationMs = projectTimelineDurationMs(soundScene, visualScene.document)
  visualPersistence.current = async (document, expectedRevision) => {
    const saved = await originsApi.updateVisualScene(project.id, expectedRevision, document)
    try {
      await soundSession.syncVisualAudio(saved.document, files)
    } catch (reason) {
      soundSession.reportError(reason instanceof Error
        ? reason.message
        : "The video audio track could not be synchronized.")
    }
    return saved
  }
  const visualSession = useMemo(() => new VisualSceneSession(visualScene, { update: (document, expectedRevision) => visualPersistence.current(document, expectedRevision) }, initialDurationMs), [project.id])
  const visualState = useVisualSceneSession(visualSession)
  const duration = projectTimelineDurationMs(soundState.scene, visualState.document) / 1000
  useEffect(() => { visualSession.setTimelineDuration(duration * 1000); visualSession.reconcile(visualScene) }, [duration, visualScene, visualSession])
  useEffect(() => {
    void soundSession.syncVisualAudio(visualScene.document, files).catch((reason) =>
      soundSession.reportError(reason instanceof Error
        ? reason.message
        : "The video audio track could not be synchronized."))
  }, [files, soundSession, visualScene.document])
  const issues = useMemo(() => projectHealth(project.parts), [project.parts])
  const staleOverrides = useMemo(() => soundState.scene.resolved.orphans.flatMap((orphan) =>
    orphan.kind === "sequence_override" && orphan.part_public_id ? [orphan.part_public_id] : []), [soundState.scene.resolved.orphans])
  const usedFileIds = useMemo(() => [...new Set([
    ...sourceParts.flatMap((part) => part.file_id ? [part.file_id] : []),
    ...soundState.scene.document.tracks.flatMap((track) => track.clips.map((clip) => clip.file_id)),
    ...visualState.document.tracks.flatMap((track) => track.clips.map((clip) => clip.file_id)),
  ])], [soundState.scene.document.tracks, sourceParts, visualState.document.tracks])
  const projectUsageCounts = useMemo(() => {
    const counts = new Map<number, number>()
    sourceParts.forEach((part) => { if (part.file_id) counts.set(part.file_id, (counts.get(part.file_id) || 0) + 1) })
    soundState.scene.document.tracks.forEach((track) => track.clips.forEach((clip) => counts.set(clip.file_id, (counts.get(clip.file_id) || 0) + 1)))
    visualState.document.tracks.forEach((track) => track.clips.forEach((clip) => counts.set(clip.file_id, (counts.get(clip.file_id) || 0) + 1)))
    return counts
  }, [soundState.scene.document.tracks, sourceParts, visualState.document.tracks])
  const renameProject = useCallback(async (name: string) => {
    await originsApi.updateProject(project.id, { name })
    await refresh()
  }, [project.id, refresh])

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

  const selectPart = useCallback((part: ProjectPart) => {
    setSelectedId(part.id)
    setCreatorOpen(false)
    setCreatorPartId(null)
  }, [])
  const editPart = useCallback((part: ProjectPart) => {
    setStage("sequence")
    setSelectedId(part.id)
    setCreatorPartId(part.id)
    setCreatorOpen(true)
  }, [])
  const openNewSpeech = useCallback((before?: ProjectPart | null) => {
    setStage("sequence")
    setSelectedId(before?.id || selectedId)
    setInsertBeforePartId(before?.public_id || null)
    setCreatorPartId(null)
    setCreatorOpen(true)
    setTool(null)
  }, [selectedId])
  const openSequenceInsert = useCallback((kind: SequenceInsertKind, before?: ProjectPart | null) => {
    if (kind === "speech") { openNewSpeech(before); return }
    setStage("sequence")
    setSelectedId(before?.id || selectedId)
    setInsertBeforePartId(before?.public_id || null)
    setCreatorPartId(null)
    setCreatorOpen(false)
    setTool(kind)
  }, [openNewSpeech, selectedId])
  const closeCreator = useCallback(() => { setCreatorOpen(false); setCreatorPartId(null); setInsertBeforePartId(null) }, [])
  const changeStage = useCallback((next: WorkstationStage) => {
    if (next !== "sound") soundSession.pause()
    setStage(next)
    closeCreator()
  }, [closeCreator, soundSession])
  const queueRender = useCallback((payload: GeneratePayload) => {
    const request = creatorPart ? actions.recordPendingPart(creatorPart, payload) : actions.generatePart(payload)
    return request.then((job) => { closeCreator(); void refresh().catch(() => undefined); return job })
  }, [actions, closeCreator, creatorPart, refresh])
  const requestPartDeletion = useCallback((part: ProjectPart) => setConfirmAction({
    title: `Delete “${partDeletionLabel(part)}” permanently?`,
    description: part.kind === "file"
      ? "This removes this linked-audio Part from the Script. The reusable Workspace File remains available."
      : part.kind === "silence"
        ? "This permanently removes this Silence Part from the Script."
        : "This removes the whole story part: its text, recording and captions. Previous provider spend remains in Activity.",
    confirmLabel: "Delete Part permanently",
    kind: "confirm",
    action: async () => { if (player.source?.key === `part:${part.id}`) player.pause(); await actions.deletePart(part); setSelectedId(null) },
  }), [actions, player])
  const requestExport = useCallback((format: "mp3" | "mp4") => {
    if (!pendingDraftCount) { void actions.exportProject(format); return }
    const label = format.toUpperCase()
    setConfirmAction({
      title: `Export the current ${label}?`,
      description: `${pendingDraftCount} planned Speech Part${pendingDraftCount === 1 ? " has" : "s have"} no recording yet. They stay safely in Script and will not be included in this ${label}.`,
      confirmLabel: `Export ${label}`,
      kind: "confirm",
      variant: "default",
      action: () => actions.exportProject(format, true),
    })
  }, [actions, pendingDraftCount])
  const openTool = useCallback((kind: Exclude<ProjectToolKind, null>) => {
    if (kind === "speech") { openNewSpeech(); return }
    if (kind === "audio") setAudioTarget({ mode: "new-track" })
    setInsertBeforePartId(null)
    setTool(kind)
  }, [openNewSpeech])
  const openFileReplacement = useCallback((part: ProjectPart) => {
    setInsertBeforePartId(null)
    setReplacingFile(part)
    setTool("file")
  }, [])
  const retryJob = useCallback(async (part: ProjectPart, _job: DurableJob<GenerateResult>) => {
    const payload = { ...(part.speech_job?.request || {}), project_id: project.id } as GeneratePayload
    if (!payload.text || part.clip_id) return
    await actions.recordPendingPart(part, payload)
    await refresh()
  }, [actions, project.id, refresh])
  const confirmJob = useCallback(async (_part: ProjectPart, job: DurableJob<GenerateResult>) => {
    await originsApi.confirmJob<GenerateResult>(job.id)
    await refresh()
  }, [refresh])
  const partActions: WorkstationPartActions = useMemo(() => ({
    select: selectPart,
    edit: editPart,
    replaceFile: openFileReplacement,
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
  }), [actions, confirmJob, editPart, openFileReplacement, openSequenceInsert, playSource, requestPartDeletion, retryJob, selectPart])

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
  const audioFile = audioClip ? files.find((file) => file.id === audioClip.file_id) : undefined
  const audioClipTitle = audioClip ? SOUND_MEDIA_LABELS[soundClipMediaKind(audioClip)] : "Audio clip"
  const visualSelection = visualState.selection
  const visualRefs = visualSelectionRefs(visualSelection)
  const visualRef = visualRefs[0] || null
  const visualTrack = visualRef ? visualState.document.tracks.find((track) => track.id === visualRef.trackId) || null : null
  const visualClip = visualRef ? visualTrack?.clips.find((clip) => clip.id === visualRef.clipId) || null : null
  const visualFile = visualClip ? files.find((file) => file.id === visualClip.file_id) : undefined
  const linkedVideoAudio = visualClip ? soundState.scene.resolved.tracks.flatMap((track) =>
    track.clips.flatMap((clip) => clip.linked_visual_clip_id === visualClip.id
      ? [{ trackId: track.id, clip }]
      : [])).at(0) : undefined
  const playingPart = actions.playerPlaying && player.source?.key.startsWith("part:")
    ? sourceParts.find((part) => part.id === Number(player.source?.key.slice(5))) || null
    : null
  const inspectorTitle = creatorOpen ? "Creator · Speech"
    : stage === "sequence" && selectedPart ? `Part ${formatPartNumber(selectedPart.position ?? 0)} · ${formatAuthoredRole(selectedPart.authored_role) || partKindLabel(selectedPart)}`
      : stage === "sound" && visualClip ? `${visualTrack?.media_type === "video" ? "Video" : "Image"} clip`
        : stage === "sound" && soundSelection?.kind === "clip" ? audioClipTitle
        : stage === "sound" && soundSelection?.kind === "clips" ? `${soundSelection.clips.length} audio clips`
          : stage === "sound" && soundSpan ? `${soundSpan.role || soundSpan.voice_name || "Script Part"} · Mix` : "Inspector"
  const creatorInsertAt = insertBeforePartId ? Math.max(0, sourceParts.findIndex((part) => part.public_id === insertBeforePartId)) : null

  const inspector = creatorOpen ? <ProjectSpeechCreatorStage
    context={{ workspace_id: project.workspace_id, folder_id: project.folder_id, project_id: project.id, project_type: "audiovisual", selection: { capability: "speech", target: "script_part" } }}
    nextPartNumber={sourceParts.length + 1} insertAt={creatorInsertAt} insertBeforePartId={insertBeforePartId}
    part={creatorPart} config={config} directory={directory} playingKey={player.source?.key} playerPlaying={actions.playerPlaying}
    onSave={async (payload) => { await actions.saveDraft(payload); closeCreator() }}
    onUpdateEditorial={async (values) => { if (!creatorPart) throw new Error("That Part is no longer open."); await actions.updatePartEditorial(creatorPart, values) }}
    onGenerate={queueRender} onPlay={(source) => void playSource(source)}
  /> : stage === "sequence" && selectedPart ? <WorkstationPartInspector
    projectId={project.id} part={selectedPart} directory={directory} playingKey={player.source?.key} playerPlaying={actions.playerPlaying}
    onPlay={(source) => void playSource(source)} onChanged={async () => { actions.invalidatePreview(); await refresh() }}
    onDuplicate={(part) => void actions.duplicatePart(part)} onDelete={requestPartDeletion} onEdit={editPart} onOpenCaptions={(part) => setCaptionPartId(part.id)} onReplaceFile={openFileReplacement}
  /> : stage === "sound" && visualRef && visualTrack && visualClip ? <VisualClipInspector
    clipRef={visualRef} track={visualTrack} clip={visualClip} file={visualFile} session={visualSession} saving={visualState.saving} audioSaving={soundState.saving}
    hasEmbeddedAudio={videoHasEmbeddedAudio(visualFile)} audioMuted={linkedVideoAudio?.clip.muted} audioGain={linkedVideoAudio?.clip.gain}
    onAudioMixChange={linkedVideoAudio ? ({ gain, muted }) => soundSession.updateClip(linkedVideoAudio.trackId, linkedVideoAudio.clip.id, { gain, muted }) : undefined}
    onAudioMixCommit={linkedVideoAudio ? ({ gain, muted }) => soundSession.commitClipChanges(linkedVideoAudio.trackId, linkedVideoAudio.clip.id, { gain, muted }) : undefined}
  /> : stage === "sound" && soundSelection?.kind === "clip" && audioTrack ? <AudioClipInspector
    track={audioTrack} clip={audioClip} file={audioFile} playingKey={player.source?.key} playing={actions.playerPlaying} onPlay={(source) => void playSource(source)}
    onClipChange={(changes) => { if (audioClip) soundSession.updateClip(audioTrack.id, audioClip.id, changes) }} onClipCommit={() => soundSession.commitClip()}
    onTrackMixChange={({ gain, muted }) => soundSession.setTrackMix(audioTrack.id, { volume: gain, muted })} onTrackMixCommit={({ gain, muted }) => soundSession.commitTrackMix(audioTrack.id, { volume: gain, muted })}
    onChoose={() => { setAudioTarget({ mode: "replace", trackId: soundSelection.trackId, clipId: soundSelection.clipId }); setTool("audio") }}
  /> : stage === "sound" && soundSpan ? <SequenceMixInspector
    span={soundSpan} saving={soundState.saving}
    onPreview={(changes) => soundSession.previewSequenceOverride(soundSpan.part_public_id, changes)}
    onCommit={(changes) => soundSession.updateSequenceOverride(soundSpan.part_public_id, changes)}
  /> : stage === "sound" && soundSelection?.kind === "clips" ? <AudioGroupInspector count={soundSelection.clips.length} />
    : <EmptyInspector stage={stage} />

  const inspectorOpen = creatorOpen || stage === "sequence" && Boolean(selectedPart) || stage === "sound" && Boolean(soundSelection || visualSelection)
  const collapsedPart = playingPart || (stage === "sequence" ? selectedPart : null)
  const collapsedState = collapsedPart ? workstationPartState(collapsedPart) : issues.length || staleOverrides.length ? "issue" : sourceParts.some((part) => workstationPartState(part) === "draft") ? "draft" : "ready"
  const collapsedNumber = collapsedPart
    ? formatPartNumber(collapsedPart.position ?? sourceParts.indexOf(collapsedPart))
    : String(stage === "sequence" ? sourceParts.length : issues.length + staleOverrides.length)
  const closeInspector = () => {
    if (creatorOpen) { closeCreator(); return }
    if (stage === "sequence") setSelectedId(null)
    else if (stage === "sound") { soundSession.select(null); visualSession.select(null) }
  }

  const overlaysOpen = Boolean(tool || confirmAction)
  usePlayerShortcuts(
    { hasSource: Boolean(player.source), currentTime: player.currentTime, toggle: player.toggle, seek: player.seek },
    () => {
      setTool(null); setConfirmAction(null); setCaptionPartId(null); setMovePositionPart(null); setReplacingFile(null)
      if (creatorOpen) closeCreator()
    }, undefined, stage !== "sound",
  )
  return <>
    <section className="audiovisual-project" data-stage={stage} data-outline-open={(stage === "library" ? libraryCreatorOpen : outlineOpen) ? "true" : "false"} data-inspector-open={inspectorOpen && stage !== "sound" ? "true" : "false"} data-inspector-expanded={creatorOpen ? "true" : "false"}>
      <WorkstationHeader project={project} duration={duration} stage={stage} issueCount={issues.length + staleOverrides.length} previewing={stage === "sound" ? soundState.playback === "preparing" : actions.previewing} playing={stage === "sound" ? soundState.playback === "playing" : actions.projectPlaying} mutationStatus={actions.mutationStatus} onStage={changeStage} onPreview={() => { if (stage === "sound") void soundSession.togglePlayback(); else void actions.toggleProject() }} onExport={() => setExportOpen(true)} onAdd={openTool} onDelete={() => setDeleteProjectOpen(true)} onRename={renameProject} />
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
        {stage === "library" && <ProjectLibraryStage
          centerPaneRef={centerPaneRef}
          projectId={project.id}
          workspaceId={project.workspace_id}
          folderId={project.folder_id}
          folders={folders}
          createOpen={libraryCreatorOpen}
          onCreateOpenChange={setLibraryCreatorOpen}
          files={files}
          projectFileIds={projectFileIds}
          libraryFileIds={libraryFileIds}
          usageCounts={projectUsageCounts}
          playingFileId={player.state === "playing" && player.source?.key.startsWith("file:") ? Number(player.source.key.slice(5)) : null}
          onPlayAudio={(file) => {
            const url = file.url || (file.filename ? `/media/${encodeURIComponent(file.filename)}` : "")
            if (!url) return
            const key = `file:${file.id}`
            void player.toggleSource({ key, url, title: file.name || file.title || "Audio", subtitle: "Project Library", kind: "file" })
          }}
          onRefresh={refreshFiles}
          onConfirmAction={setConfirmAction}
          onAddToTimeline={async (file) => {
            await visualSession.addVisual(file, soundSession.snapshot().playhead * 1000)
            setStage("sound")
          }}
          onUpload={async (file) => {
            if (!project.workspace_id) throw new Error("The Workspace File library is unavailable.")
            const details = {
              name: file.name.replace(/\.[^.]+$/, ""),
              category: null,
              tags: [],
            }
            return await originsApi.uploadAudiovisualProjectFile(project.id, file, details) as WorkspaceFile
          }}
        />}
        {stage === "sound" && <TimelineStage
          centerPaneRef={centerPaneRef}
          projectFileIds={projectFileIds}
          session={soundSession}
          inspector={inspectorOpen ? inspector : undefined}
          inspectorTitle={inspectorTitle}
          onCloseInspector={closeInspector}
          visual={{
            session: visualSession,
            files,
            onAddVisual: () => undefined,
            onRemoveClip: (refs, name) => setConfirmAction({
              title: `Remove this media placement: “${name}”?`,
              description: refs.length === 1 ? "This removes only the Timeline placement. Its source File remains available in the File Library." : `This removes ${refs.length} Timeline placements. Their source Files remain available in the File Library.`,
              action: () => visualSession.removeClips(refs),
            }),
            onRemoveTrack: (track) => setConfirmAction({
              title: `Remove this ${visualTrackDisplayName(track, files)} track?`,
              description: `This removes the track and its ${track.clips.length} media placement${track.clips.length === 1 ? "" : "s"}. Their source Files remain available in the File Library.`,
              action: () => visualSession.removeTrack(track.id),
            }),
          }}
          onAddAudio={(target) => { setAudioTarget(target); setTool("audio") }}
          onRemoveClip={({ clips }) => {
            const names = clips.flatMap((ref) => {
              const clip = soundState.scene.resolved.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
              return clip ? [clip.file_name || "Audio clip"] : []
            })
            setConfirmAction({
              title: clips.length === 1 ? `Remove this clip: “${names[0] || "Audio clip"}”?` : `Remove ${clips.length} selected audio clips?`,
              description: "Only the selected Timeline placements are removed. Their source Files remain available in the File Library.",
              action: () => soundSession.removeClips(clips),
            })
          }}
          onRemoveTrack={(track) => setConfirmAction({
            title: `Remove this ${soundTrackDisplayName(track)} track?`,
            description: `This removes the track and its ${track.clips.length} placement${track.clips.length === 1 ? "" : "s"}. Their source Files remain available in the File Library.`,
            action: () => soundSession.removeTrack(track.id),
          })}
        />}
        {inspectorOpen && stage !== "sound" && <aside className="ws-right-pane" aria-label="Contextual inspector">
          <header><h2>{inspectorTitle}</h2><OperatorIconButton label="Close inspector" detail="Keeps the current Project changes." onClick={closeInspector}><X /></OperatorIconButton></header>
          <div className="ws-inspector-content">{inspector}</div>
        </aside>}
      </div>
      {stage !== "sound" && <ProjectFloatingTransport
        previewStale={Boolean(player.source?.kind === "project" && !actions.projectLoaded)}
        onRefreshPreview={() => void actions.toggleProject()}
        onOpenCaptionContext={(partId) => {
          if (!sourceParts.some((part) => part.id === partId)) return
          setStage("sequence")
          setSelectedId(partId)
          setCaptionPartId(partId)
        }}
      />}
    </section>
    <ExportDialog
      open={exportOpen}
      onOpenChange={setExportOpen}
      project={project}
      soundScene={soundState.scene}
      visualScene={{ ...visualScene, document: visualState.document }}
      issues={issues}
      staleOverrides={staleOverrides}
      exportJob={actions.exportJob}
      onExport={requestExport}
      onLocatePart={(id) => {
        setExportOpen(false)
        setStage("sequence")
        setSelectedId(id)
        requestAnimationFrame(() => document.getElementById(`ws-part-${id}`)?.scrollIntoView({ block: "center" }))
      }}
      onOpenHealth={() => undefined}
      onRemoveOverride={(partPublicId) => { void soundSession.removeSequenceOverride(partPublicId) }}
      exporting={actions.exporting}
      exportingFormat={actions.exportingFormat}
    />
    <DeleteProjectDialog project={project} open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen} onDeleted={() => { player.pause(); navigate(`${originsBase}/projects`) }} />
    <PartCaptionsDialog projectId={project.id} part={captionPart} directory={directory} onOpenChange={(open) => { if (!open) setCaptionPartId(null) }} onChanged={async () => { actions.invalidatePreview(); await refresh() }} />
    <MovePartPositionDialog part={movePositionPart} count={sourceParts.length} onClose={() => setMovePositionPart(null)} onMove={actions.movePartToPosition} />
    {overlaysOpen && <ProjectOverlays
      tool={tool} project={project} nextPartNumber={sourceParts.length + 1} insertAt={creatorInsertAt} insertBeforePartId={insertBeforePartId}
      creatorPart={null} replacingFileId={replacingFile?.file_id} initialAudioFileId={audioClip?.file_id} config={config} directory={directory} files={files} fileState={fileState} usedFileIds={usedFileIds}
      playingKey={player.source?.key} playerPlaying={actions.playerPlaying} confirmAction={confirmAction}
      onCloseTool={() => { setTool(null); setReplacingFile(null); setAudioTarget(null) }} onSaveDraft={actions.saveDraft} onUpdateEditorial={async () => undefined} onGenerate={queueRender}
      onAddSilence={async (seconds) => { await actions.addSilence(seconds, insertBeforePartId); setTool(null) }}
      onInsertFile={async (file) => { if (replacingFile) await actions.replaceFile(replacingFile, file); else await actions.insertFile(file, insertBeforePartId); setTool(null); setReplacingFile(null) }}
      onPlaceAudio={async (file) => {
        if (audioTarget?.mode === "replace") await soundSession.replaceClipSource(audioTarget.trackId, audioTarget.clipId, file)
        else if (audioTarget?.mode === "add-clip") await soundSession.addClip(audioTarget.trackId, file, soundSession.snapshot().playhead)
        else await soundSession.addTrack(file, soundSession.snapshot().playhead)
        setTool(null); setAudioTarget(null); setStage("sound")
      }}
      onUploadFile={actions.uploadFile}
      onUpdateFile={actions.updateFile}
      onKeepFile={async (_category, input) => actions.keepFreesound(input)}
      onImported={() => { actions.invalidatePreview(); void refresh().then(() => setTool(null)) }}
      onPlay={(source) => void playSource(source)} onConfirmAction={setConfirmAction} onRetryFiles={refreshFiles}
    />}
  </>
}
