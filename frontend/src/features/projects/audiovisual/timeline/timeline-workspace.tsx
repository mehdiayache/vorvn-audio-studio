import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { SOUND_SCENE_ZOOM_LEVELS } from "@/features/sound-scene/engine/sound-scene-engine"
import { SoundSceneSession, useSoundSceneSession, type SoundClipRef } from "@/features/sound-scene/engine/sound-scene-session"
import { gainToDb } from "@/features/sound-scene/sound-scene-gain"
import { soundClipMediaKind } from "@/features/sound-scene/sound-media-icon"
import type { SoundContext } from "@/features/sound-scene/timeline/sound-scene-context-toolbar"
import { VisualSceneSession, useVisualSceneSession, type VisualClipRef } from "@/features/visual-scene/engine/visual-scene-session"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SoundSceneTrack, WorkspaceFile, VisualSceneTrack } from "@/types/domain"
import { visualFileName } from "@/features/creator/library/visual-file-presentation"
import { AudioTimelineSection } from "./audio-timeline-section"
import { projectTimelineDurationMs } from "./timeline-duration"
import { TimelineRuler } from "./timeline-ruler"
import { TimelineContextBar } from "./timeline-context-bar"
import { TimelineToolbar } from "./timeline-toolbar"
import { TimelineTrackControls } from "./timeline-track-controls"
import { TimelineZoom } from "./timeline-zoom"
import { useAudioTimelineGestures } from "./use-audio-timeline-gestures"
import { useTimelineHistory } from "./use-timeline-history"
import { useTimelineShortcuts } from "./use-timeline-shortcuts"
import { useTimelineSnapping } from "./use-timeline-snapping"
import { useTimelineViewport } from "./use-timeline-viewport"
import { useVisualTimelineGestures } from "./use-visual-timeline-gestures"
import { VisualTimelineSection } from "./visual-timeline-section"
import { TimelineWorkbench } from "./timeline-workbench"
import type { PreviewTarget } from "./timeline-preview"
import { TimelineTransport } from "./timeline-transport"
import { resolveWorkstationSelection } from "./workstation-selection"
import { useWorkstationLayout } from "./use-workstation-layout"

import "./timeline-workspace.css"
import "@/features/visual-scene/timeline/visual-scene.css"

const SAMPLE_RATE = 48_000
const LANE_HEIGHT = 64
const RULER_HEIGHT = 30

type AddTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string }
type RemoveTarget = { clips: SoundClipRef[] }

export function TimelineWorkspace({ session, visual, projectFileIds = [], inspector, inspectorTitle, onCloseInspector, onAddAudio, onRemoveClip, onRemoveTrack }: {
  session: SoundSceneSession
  visual?: {
    session: VisualSceneSession
    files: WorkspaceFile[]
    onAddVisual: (trackId?: string) => void
    onRemoveClip: (refs: VisualClipRef[], name: string) => void
    onRemoveTrack: (track: VisualSceneTrack) => void
  }
  projectFileIds?: number[]
  inspector?: ReactNode
  inspectorTitle?: string
  onCloseInspector?: () => void
  onAddAudio: (target: AddTarget) => void
  onRemoveClip: (target: RemoveTarget) => void
  onRemoveTrack: (track: SoundSceneTrack) => void
}) {
  const { scene, engine, selection, playhead, playback, saving, error, soloTrackIds, playbackRange, revisionKind } = useSoundSceneSession(session)
  const player = useGlobalPlayer()
  const visualState = useVisualSceneSession(visual?.session)
  const [tracksCollapsed, setTracksCollapsed] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>({ kind: "timeline" })
  const layout = useWorkstationLayout()
  const tracks = scene.resolved.tracks
  const visualTracks = visualState.document.tracks
  const total = Math.max(projectTimelineDurationMs(scene, visualState.document) / 1000, 1)
  const pixelsPerSecond = SAMPLE_RATE / engine.samplesPerPixel
  const viewport = useTimelineViewport({ session, total, pixelsPerSecond, samplesPerPixel: engine.samplesPerPixel, playhead, playback })
  const snapping = useTimelineSnapping({ pixelsPerSecond, playhead, sequence: scene.resolved.sequence_projection.spans, audioTracks: tracks, visualTracks })
  const history = useTimelineHistory({
    audioRevision: scene.revision,
    audioRevisionKind: revisionKind,
    visualRevision: visualState.scene.revision,
    audioCanUndo: scene.can_undo,
    audioCanRedo: scene.can_redo,
    visualCanUndo: visualState.canUndo,
    visualCanRedo: visualState.canRedo,
    undoAudio: () => session.undo(),
    redoAudio: () => session.redo(),
    undoVisual: visual ? () => visual.session.undo() : undefined,
    redoVisual: visual ? () => visual.session.redo() : undefined,
  })
  const hasVisualPlacements = visualTracks.some((track) => track.clips.length > 0)
  const pauseCount = scene.resolved.sequence_projection.spans.filter((span) => span.silence).length
  const audioCount = scene.resolved.sequence_projection.spans.length - pauseCount
  const sequenceSummary = `${audioCount} audio · ${pauseCount} pause${pauseCount === 1 ? "" : "s"}`
  const rowTemplate = `${RULER_HEIGHT}px repeat(${visualTracks.length + tracks.length + 1}, ${LANE_HEIGHT}px)`
  const styleFor = (start: number, duration: number, minimum = 2) => ({ left: start * pixelsPerSecond, width: Math.max(duration * pixelsPerSecond, minimum) } as CSSProperties)

  const workstationSelection = useMemo(() => resolveWorkstationSelection({
    soundSelection: selection,
    visualSelection: visualState.selection,
    soundTracks: tracks,
    visualTracks,
    spans: scene.resolved.sequence_projection.spans,
    files: visual?.files || [],
  }), [scene.resolved.sequence_projection.spans, selection, tracks, visual?.files, visualState.selection, visualTracks])
  const selectedRefs = workstationSelection?.kind === "audio-placement"
    ? workstationSelection.placements.map(({ ref }) => ref)
    : []
  const selectedClips = selectedRefs.flatMap((ref) => {
    const clip = session.currentClip(ref.trackId, ref.clipId)
    return clip ? [{ ref, clip }] : []
  })
  const selectedPart = workstationSelection?.kind === "script-part" ? workstationSelection.span : null
  const selectedVisualRefs = workstationSelection?.kind === "visual-placement" ? workstationSelection.placements.map(({ ref }) => ref) : []
  const selectedVisualRef = workstationSelection?.kind === "visual-placement" ? workstationSelection.primary.ref : null
  const selectedVisualTrack = workstationSelection?.kind === "visual-placement" ? workstationSelection.primary.track : null
  const selectedVisualClip = workstationSelection?.kind === "visual-placement" ? workstationSelection.primary.clip : null
  const selectedVisualFile = workstationSelection?.kind === "visual-placement" ? workstationSelection.primary.file : undefined
  const selectedVideoAudio = selectedVisualClip ? tracks.flatMap((track) => track.clips.flatMap((clip) => clip.linked_visual_clip_id === selectedVisualClip.id ? [{ trackId: track.id, clip }] : [])).at(0) : undefined
  const canSplitVisual = Boolean(selectedVisualRef && selectedVisualClip && visual?.session.canSplitVideo(selectedVisualRef, playhead * 1000, selectedVisualFile))
  const lockedClipCount = selectedClips.filter(({ clip }) => clip.locked).length
  const context: SoundContext | null = selectedPart ? {
    kind: selectedPart.silence ? "silence" : "sequence",
    label: selectedPart.silence ? `Silence · ${formatDuration(selectedPart.duration_ms / 1000)}` : selectedPart.role || selectedPart.voice_name || selectedPart.title || `Part ${Number(selectedPart.position ?? 0) + 1}`,
    muted: selectedPart.mix.muted || selectedPart.mix.gain <= 0, gain: selectedPart.mix.gain, effects: selectedPart.mix.effects,
  } : selectedClips.length ? {
    kind: "audio", label: selectedClips.length === 1 ? selectedClips[0]!.clip.file_name || "Audio clip" : "Audio selection",
    mediaKind: selectedClips.every(({ clip }) => soundClipMediaKind(clip) === soundClipMediaKind(selectedClips[0]!.clip))
      ? soundClipMediaKind(selectedClips[0]!.clip) : "audio",
    count: selectedClips.length,
    muted: selectedClips.every(({ clip }) => clip.muted || clip.gain <= 0),
    lockState: lockedClipCount === 0 ? "unlocked" : lockedClipCount === selectedClips.length ? "locked" : "mixed",
    gain: selectedClips[0]!.clip.gain,
    gainMixed: selectedClips.some(({ clip }) =>
      (clip.muted || clip.gain <= 0) !== (selectedClips[0]!.clip.muted || selectedClips[0]!.clip.gain <= 0)
      || Math.abs(gainToDb(clip.gain) - gainToDb(selectedClips[0]!.clip.gain)) > .05),
    effects: selectedClips[0]!.clip.effects,
  } : null
  const canCrossfade = Boolean(session.crossfadeOverlap(selectedRefs))
  const canSplit = session.canSplitClipsAtPlayhead(selectedRefs, playhead)

  const audioGesture = useAudioTimelineGestures({ session, visualSession: visual?.session, engine, selectedRefs, saving, pixelsPerSecond, snap: snapping.snap, clearSnapGuide: snapping.clearGuide, activeCancel: viewport.activeCancel })
  const visualGesture = useVisualTimelineGestures({ session, visualSession: visual?.session, files: visual?.files || [], visualTracks, selectedRefs: selectedVisualRefs, saving: visualState.saving, pixelsPerSecond, snap: snapping.snap, clearSnapGuide: snapping.clearGuide, activeCancel: viewport.activeCancel })
  const deleteVisualSelection = () => {
    if (!visual || !selectedVisualRefs.length) return
    visual.onRemoveClip(selectedVisualRefs, selectedVisualRefs.length === 1 && selectedVisualFile ? visualFileName(selectedVisualFile) : `${selectedVisualRefs.length} media clips`)
  }
  useTimelineShortcuts({
    activeCancel: viewport.activeCancel,
    hasAudioSelection: selectedRefs.length > 0,
    hasVisualSelection: selectedVisualRefs.length > 0,
    canSplitVisual,
    undo: () => void history.undo(),
    redo: () => void history.redo(),
    duplicateAudio: () => void session.duplicateClips(selectedRefs),
    duplicateVisual: () => void visual?.session.duplicateClips(selectedVisualRefs),
    splitAudio: () => void session.splitClipsAtPlayhead(selectedRefs),
    splitVisual: () => { if (visual && selectedVisualRef) void visual.session.splitVideo(selectedVisualRef, playhead * 1000, selectedVisualFile) },
    playAudioSelection: (loop) => { viewport.setFollowPlayhead(true); void session.playSelection(loop, selectedRefs) },
    togglePlayback: () => { player.close(); setPreviewTarget({ kind: "timeline" }); viewport.setFollowPlayhead(true); void session.togglePlayback() },
    nudgeAudio: (deltaMs) => void session.nudgeClips(deltaMs, selectedRefs),
    nudgeVisual: (deltaMs) => void visual?.session.nudgeClips(selectedVisualRefs, deltaMs),
    seekStart: () => session.seek(0),
    zoom: (delta) => viewport.setCenteredZoom(viewport.zoomIndex + delta),
    clearSelection: () => { session.select(null); visual?.session.select(null) },
    canDeleteAudio: !selectedClips.some(({ clip }) => clip.locked),
    canDeleteVisual: !selectedVisualRefs.some((ref) => visual?.session.currentClip(ref)?.locked || visualTracks.find((track) => track.id === ref.trackId)?.locked),
    deleteAudio: () => onRemoveClip({ clips: selectedRefs }),
    deleteVisual: deleteVisualSelection,
  })

  const usedFileIds = useMemo(() => [
    ...visualTracks.flatMap((track) => track.clips.map((clip) => clip.file_id)),
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.file_id).filter((id): id is number => typeof id === "number")),
  ], [tracks, visualTracks])
  const previewSourceFile = useCallback((file: WorkspaceFile) => {
    session.pause()
    player.close()
    setPreviewTarget({ kind: "source", fileId: file.id })
  }, [player, session])
  const returnToTimelinePreview = useCallback(() => {
    player.close()
    setPreviewTarget({ kind: "timeline" })
  }, [player])
  const addFileAtPlayhead = useCallback(async (file: WorkspaceFile) => {
    const currentPlayhead = session.snapshot().playhead
    if (file.media_type === "audio") await session.addTrack(file, currentPlayhead)
    else if (visual && (file.media_type === "image" || file.media_type === "video")) await visual.session.addVisual(file, currentPlayhead * 1_000)
  }, [session, visual])
  return <section className={cn("timeline-workspace", tracksCollapsed && "tracks-collapsed", viewport.panning && "is-panning")} style={{ "--timeline-workbench-height": `${layout.workbenchHeight}px` } as CSSProperties}>
    <TimelineWorkbench
      selection={workstationSelection}
      previewTarget={previewTarget}
      files={visual?.files || []}
      projectFileIds={projectFileIds}
      usedFileIds={usedFileIds}
      document={visualState.document}
      hasVisualPlacements={hasVisualPlacements}
      playheadMs={playhead * 1_000}
      playback={playback}
      visualSession={visual?.session}
      soundSession={session}
      visualSaving={visualState.saving}
      timelineTransport={<TimelineTransport session={session} onActivateTimeline={returnToTimelinePreview} />}
      browserCollapsed={layout.browserCollapsed}
      onBrowserCollapsedChange={layout.setBrowserCollapsed}
      inspector={inspector}
      inspectorTitle={inspectorTitle}
      onCloseInspector={onCloseInspector}
      onPreviewFile={previewSourceFile}
      onReturnTimeline={returnToTimelinePreview}
      onAddFile={addFileAtPlayhead}
    />
    <button type="button" className="timeline-workbench-resize" aria-label="Resize Monitor and Timeline" aria-valuemin={220} aria-valuemax={620} aria-valuenow={Math.round(layout.workbenchHeight)} onDoubleClick={() => layout.setWorkbenchHeight(360)} onKeyDown={(event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      layout.setWorkbenchHeight(Math.max(220, Math.min(620, layout.workbenchHeight + (event.key === "ArrowDown" ? 16 : -16))))
    }} onPointerDown={layout.begin} onPointerMove={layout.move} onPointerUp={layout.end} onPointerCancel={layout.end} />
    <TimelineToolbar
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      undoDomain={history.undoDomain}
      redoDomain={history.redoDomain}
      saving={saving || visualState.saving}
      snapping={snapping.enabled}
      followPlayhead={viewport.followPlayhead}
      hasVisualScene={Boolean(visual)}
      onUndo={() => void history.undo()}
      onRedo={() => void history.redo()}
      onMoveView={viewport.moveView}
      onSnappingChange={snapping.changeEnabled}
      onFollowPlayheadChange={viewport.setFollowPlayhead}
      onAddVisual={() => visual?.onAddVisual()}
      onAddAudio={() => onAddAudio({ mode: "new-track" })}
    />
    <div className="sound-scene-stage">
      <div className="sound-scene-editor">
        <aside ref={viewport.controlsRef} className="sound-scene-track-controls" style={{ gridTemplateRows: rowTemplate }} onWheel={(event) => { if (viewport.scrollRef.current) viewport.scrollRef.current.scrollTop += event.deltaY }}>
          <TimelineTrackControls
            audioSession={session}
            visualSession={visual?.session}
            audioTracks={tracks}
            engineTracks={engine.tracks}
            visualTracks={visualTracks}
            files={visual?.files || []}
            collapsed={tracksCollapsed}
            soloTrackIds={soloTrackIds}
            sequenceSummary={sequenceSummary}
            onCollapsedChange={setTracksCollapsed}
            onAddAudio={(trackId) => onAddAudio(trackId ? { mode: "add-clip", trackId } : { mode: "new-track" })}
            onAddVisual={(trackId) => visual?.onAddVisual(trackId)}
            onRemoveAudioTrack={onRemoveTrack}
            onRemoveVisualTrack={(track) => visual?.onRemoveTrack(track)}
          />
        </aside>
        <div className="sound-scene-scroll" ref={viewport.scrollRef} onScroll={(event) => viewport.syncVerticalScroll(event.currentTarget.scrollTop)}>
          <div className="sound-scene-timeline" style={{ width: viewport.width, gridTemplateRows: rowTemplate }} onPointerDown={viewport.panTimeline}>
            <TimelineRuler marks={viewport.marks} pixelsPerSecond={pixelsPerSecond} playhead={playhead} playbackRange={playbackRange} snapGuide={snapping.guide} onSeek={viewport.seekFromPointer} />
            <VisualTimelineSection tracks={visualTracks} files={visual?.files || []} selection={selectedVisualRefs} styleFor={styleFor} onSelect={(event, ref) => { const modified = event.nativeEvent as MouseEvent | KeyboardEvent; returnToTimelinePreview(); visual?.session.selectClip(ref, modified.shiftKey || modified.metaKey || modified.ctrlKey); session.select(null) }} onGesture={(event, ref, mode) => { returnToTimelinePreview(); visualGesture(event, ref, mode) }} onAdd={(trackId) => visual?.onAddVisual(trackId)} onPan={viewport.panTimeline} />
            <AudioTimelineSection scene={scene} tracks={tracks} engineTracks={engine.tracks} selection={selection} selectedRefs={selectedRefs} soloTrackIds={soloTrackIds} pixelsPerSecond={pixelsPerSecond} styleFor={styleFor} currentClip={(trackId, clipId) => session.currentClip(trackId, clipId)} onSelectPart={(partId) => { returnToTimelinePreview(); session.select({ kind: "part", id: partId }); visual?.session.select(null) }} onPreviewPartMix={(partPublicId, changes) => session.previewSequenceOverride(partPublicId, changes)} onCommitPartMix={(partPublicId, changes) => { void session.updateSequenceOverride(partPublicId, changes) }} onSelectClip={(event, trackId, clipId) => { returnToTimelinePreview(); session.selectClip(trackId, clipId, event.shiftKey || event.metaKey || event.ctrlKey); visual?.session.select(null) }} onGesture={(event, trackId, clipId, mode) => { returnToTimelinePreview(); audioGesture(event, trackId, clipId, mode) }} onAdd={(trackId) => onAddAudio({ mode: "add-clip", trackId })} onPan={viewport.panTimeline} saving={saving} />
          </div>
        </div>
        <TimelineZoom index={viewport.zoomIndex} maximum={SOUND_SCENE_ZOOM_LEVELS.length - 1} pixelsPerSecond={pixelsPerSecond} onChange={viewport.setCenteredZoom} onFit={viewport.fitTimeline} />
      </div>
    </div>
    <TimelineContextBar
      audioSession={session}
      visualSession={visual?.session}
      selectedAudioRefs={selectedRefs}
      selectedPart={selectedPart}
      context={context}
      selectedVisualRefs={selectedVisualRefs}
      selectedVisualTrack={selectedVisualTrack}
      selectedVisualFile={selectedVisualFile}
      selectedVideoAudio={selectedVideoAudio}
      playhead={playhead}
      saving={saving}
      visualSaving={visualState.saving}
      canSplitAudio={canSplit}
      canSplitVisual={canSplitVisual}
      canCrossfade={canCrossfade}
      error={error}
      visualError={visualState.error}
      onFollowPlayhead={() => viewport.setFollowPlayhead(true)}
      onRemoveAudio={() => onRemoveClip({ clips: selectedRefs })}
      onRemoveVisual={deleteVisualSelection}
    />
  </section>
}
