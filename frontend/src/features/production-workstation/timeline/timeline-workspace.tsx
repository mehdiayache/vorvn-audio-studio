import { useState, type CSSProperties } from "react"
import { SOUND_SCENE_ZOOM_LEVELS } from "@/features/sound-scene/engine/sound-scene-engine"
import { SoundSceneSession, useSoundSceneSession, type SoundClipRef } from "@/features/sound-scene/engine/sound-scene-session"
import { gainToDb } from "@/features/sound-scene/sound-scene-gain"
import type { SoundContext } from "@/features/sound-scene/timeline/sound-scene-context-toolbar"
import { VisualSceneSession, useVisualSceneSession, visualSelectionRefs, type VisualClipRef } from "@/features/visual-scene/engine/visual-scene-session"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SoundSceneTrack, VentureAsset, VisualSceneTrack } from "@/types/domain"
import { visualAssetName } from "../director/director-assets"
import { AudioTimelineSection } from "./audio-timeline-section"
import { productionTimelineDurationMs } from "./timeline-duration"
import { TimelineRuler } from "./timeline-ruler"
import { TimelineContextBar } from "./timeline-context-bar"
import { TimelineToolbar } from "./timeline-toolbar"
import { TimelineTrackControls } from "./timeline-track-controls"
import { TimelineViewer } from "./timeline-viewer"
import { TimelineZoom } from "./timeline-zoom"
import { useAudioTimelineGestures } from "./use-audio-timeline-gestures"
import { useTimelineHistory } from "./use-timeline-history"
import { useTimelineShortcuts } from "./use-timeline-shortcuts"
import { useTimelineSnapping } from "./use-timeline-snapping"
import { useTimelineViewport, VIEWER_DEFAULT_WIDTH, VIEWER_MAX_WIDTH, VIEWER_MIN_WIDTH } from "./use-timeline-viewport"
import { useVisualTimelineGestures } from "./use-visual-timeline-gestures"
import { VisualTimelineSection } from "./visual-timeline-section"

import "./timeline-workspace.css"
import "@/features/visual-scene/timeline/visual-scene.css"

const SAMPLE_RATE = 48_000
const LANE_HEIGHT = 64
const RULER_HEIGHT = 30

type AddTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string }
type RemoveTarget = { clips: SoundClipRef[] }

export function TimelineWorkspace({ session, visual, onAddAudio, onRemoveClip, onRemoveTrack }: {
  session: SoundSceneSession
  visual?: {
    session: VisualSceneSession
    assets: VentureAsset[]
    onAddVisual: (trackId?: string) => void
    onRemoveClip: (refs: VisualClipRef[], name: string) => void
    onRemoveTrack: (track: VisualSceneTrack) => void
  }
  onAddAudio: (target: AddTarget) => void
  onRemoveClip: (target: RemoveTarget) => void
  onRemoveTrack: (track: SoundSceneTrack) => void
}) {
  const { scene, engine, selection, playhead, playback, saving, error, soloTrackIds, playbackRange, revisionKind } = useSoundSceneSession(session)
  const visualState = useVisualSceneSession(visual?.session)
  const [tracksCollapsed, setTracksCollapsed] = useState(false)
  const tracks = scene.resolved.tracks
  const visualTracks = visualState.document.tracks
  const total = Math.max(productionTimelineDurationMs(scene, visualState.document) / 1000, 1)
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

  const selectedRefs = selection?.kind === "clip"
    ? [{ trackId: selection.trackId, clipId: selection.clipId }]
    : selection?.kind === "clips" ? selection.clips : []
  const selectedClips = selectedRefs.flatMap((ref) => {
    const clip = session.currentClip(ref.trackId, ref.clipId)
    return clip ? [{ ref, clip }] : []
  })
  const selectedPart = selection?.kind === "part"
    ? scene.resolved.sequence_projection.spans.find((span) => span.part_id === selection.id) || null
    : null
  const selectedVisualRefs = visualSelectionRefs(visualState.selection)
  const selectedVisualRef = selectedVisualRefs[0] || null
  const selectedVisualTrack = selectedVisualRef ? visualTracks.find((track) => track.id === selectedVisualRef.trackId) || null : null
  const selectedVisualClip = selectedVisualRef ? selectedVisualTrack?.clips.find((clip) => clip.id === selectedVisualRef.clipId) || null : null
  const selectedVisualAsset = selectedVisualClip && visual ? visual.assets.find((asset) => asset.id === selectedVisualClip.asset_id) : undefined
  const selectedVideoAudio = selectedVisualClip ? tracks.flatMap((track) => track.clips.flatMap((clip) => clip.linked_visual_clip_id === selectedVisualClip.id ? [{ trackId: track.id, clip }] : [])).at(0) : undefined
  const canSplitVisual = Boolean(selectedVisualRef && selectedVisualClip && visual?.session.canSplitVideo(selectedVisualRef, playhead * 1000, selectedVisualAsset))
  const lockedClipCount = selectedClips.filter(({ clip }) => clip.locked).length
  const context: SoundContext | null = selectedPart ? {
    kind: selectedPart.silence ? "silence" : "sequence",
    label: selectedPart.silence ? `Silence · ${formatDuration(selectedPart.duration_ms / 1000)}` : selectedPart.role || selectedPart.voice_name || selectedPart.title || `Part ${Number(selectedPart.position ?? 0) + 1}`,
    muted: selectedPart.mix.muted, gain: selectedPart.mix.gain, effects: selectedPart.mix.effects,
  } : selectedClips.length ? {
    kind: "audio", label: selectedClips.length === 1 ? selectedClips[0]!.clip.asset_name || "Audio clip" : "Audio selection",
    count: selectedClips.length,
    muted: selectedClips.every(({ clip }) => clip.muted),
    lockState: lockedClipCount === 0 ? "unlocked" : lockedClipCount === selectedClips.length ? "locked" : "mixed",
    gain: selectedClips[0]!.clip.gain,
    gainMixed: selectedClips.some(({ clip }) => Math.abs(gainToDb(clip.gain) - gainToDb(selectedClips[0]!.clip.gain)) > .05),
    effects: selectedClips[0]!.clip.effects,
  } : null
  const canCrossfade = Boolean(session.crossfadeOverlap(selectedRefs))
  const canSplit = session.canSplitClipsAtPlayhead(selectedRefs, playhead)

  const audioGesture = useAudioTimelineGestures({ session, visualSession: visual?.session, engine, selectedRefs, saving, pixelsPerSecond, snap: snapping.snap, clearSnapGuide: snapping.clearGuide, activeCancel: viewport.activeCancel })
  const visualGesture = useVisualTimelineGestures({ session, visualSession: visual?.session, assets: visual?.assets || [], visualTracks, selectedRefs: selectedVisualRefs, saving: visualState.saving, pixelsPerSecond, snap: snapping.snap, clearSnapGuide: snapping.clearGuide, activeCancel: viewport.activeCancel })
  const deleteVisualSelection = () => {
    if (!visual || !selectedVisualRefs.length) return
    visual.onRemoveClip(selectedVisualRefs, selectedVisualRefs.length === 1 && selectedVisualAsset ? visualAssetName(selectedVisualAsset) : `${selectedVisualRefs.length} media clips`)
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
    splitVisual: () => { if (visual && selectedVisualRef) void visual.session.splitVideo(selectedVisualRef, playhead * 1000, selectedVisualAsset) },
    playAudioSelection: (loop) => { viewport.setFollowPlayhead(true); void session.playSelection(loop, selectedRefs) },
    togglePlayback: () => { viewport.setFollowPlayhead(true); void session.togglePlayback() },
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

  return <section className={cn("timeline-workspace", hasVisualPlacements && "has-visual-monitor", viewport.viewerCollapsed && "viewer-collapsed", tracksCollapsed && "tracks-collapsed", viewport.panning && "is-panning")}>
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
    <div className="sound-scene-stage" style={{ "--timeline-viewer-width": `${viewport.viewerWidth}px` } as CSSProperties}>
      {visual && hasVisualPlacements && <TimelineViewer document={visualState.document} assets={visual.assets} playheadMs={playhead * 1000} playback={playback} selection={selectedVisualRef} session={visual.session} saving={visualState.saving} collapsed={viewport.viewerCollapsed} onCollapsedChange={viewport.setViewerCollapsed} onAddMedia={() => visual.onAddVisual()} />}
      {visual && hasVisualPlacements && !viewport.viewerCollapsed && <button
        type="button"
        className={cn("timeline-viewer-resize-handle", viewport.viewerResizing && "is-resizing")}
        aria-label="Resize Viewer"
        aria-valuemin={VIEWER_MIN_WIDTH}
        aria-valuemax={VIEWER_MAX_WIDTH}
        aria-valuenow={Math.round(viewport.viewerWidth)}
        onDoubleClick={() => viewport.adjustViewerWidth(VIEWER_DEFAULT_WIDTH - viewport.viewerWidth)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          viewport.adjustViewerWidth(event.key === "ArrowLeft" ? -16 : 16)
        }}
        onPointerDown={viewport.beginViewerResize}
        onPointerMove={viewport.resizeViewer}
        onPointerUp={viewport.finishViewerResize}
        onPointerCancel={viewport.finishViewerResize}
      />}
      <div className="sound-scene-editor">
        <aside ref={viewport.controlsRef} className="sound-scene-track-controls" style={{ gridTemplateRows: rowTemplate }} onWheel={(event) => { if (viewport.scrollRef.current) viewport.scrollRef.current.scrollTop += event.deltaY }}>
          <TimelineTrackControls
            audioSession={session}
            visualSession={visual?.session}
            audioTracks={tracks}
            engineTracks={engine.tracks}
            visualTracks={visualTracks}
            assets={visual?.assets || []}
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
            <VisualTimelineSection tracks={visualTracks} assets={visual?.assets || []} selection={selectedVisualRefs} styleFor={styleFor} onSelect={(event, ref) => { const modified = event.nativeEvent as MouseEvent | KeyboardEvent; visual?.session.selectClip(ref, modified.shiftKey || modified.metaKey || modified.ctrlKey); session.select(null) }} onGesture={visualGesture} onAdd={(trackId) => visual?.onAddVisual(trackId)} onPan={viewport.panTimeline} />
            <AudioTimelineSection scene={scene} tracks={tracks} engineTracks={engine.tracks} selection={selection} selectedRefs={selectedRefs} soloTrackIds={soloTrackIds} pixelsPerSecond={pixelsPerSecond} styleFor={styleFor} currentClip={(trackId, clipId) => session.currentClip(trackId, clipId)} onSelectPart={(partId) => { session.select({ kind: "part", id: partId }); visual?.session.select(null) }} onSelectClip={(event, trackId, clipId) => { session.selectClip(trackId, clipId, event.shiftKey || event.metaKey || event.ctrlKey); visual?.session.select(null) }} onGesture={audioGesture} onAdd={(trackId) => onAddAudio({ mode: "add-clip", trackId })} onPan={viewport.panTimeline} />
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
      selectedVisualAsset={selectedVisualAsset}
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
