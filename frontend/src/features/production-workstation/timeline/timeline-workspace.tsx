import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { AudioWaveform, CircleAlert, Film, Image as ImageIcon, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { videoHasEmbeddedAudio } from "@/features/sound-scene/engine/video-audio-sync"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SoundSceneTrack } from "@/types/domain"
import type { VentureAsset, VisualSceneTrack } from "@/types/domain"
import { visualAssetName } from "@/features/production-workstation/director/director-assets"
import { VisualSceneSession, useVisualSceneSession, visualSelectionRefs, type VisualClipRef } from "@/features/visual-scene/engine/visual-scene-session"
import { VisualContextToolbar } from "@/features/visual-scene/timeline/visual-timeline-parts"
import { TimelineViewer } from "@/features/production-workstation/timeline/timeline-viewer"
import { TimelineRuler } from "./timeline-ruler"
import { TimelineToolbar } from "./timeline-toolbar"
import { TimelineZoom } from "./timeline-zoom"
import { VisualTimelineSection, VisualTrackHeaders } from "./visual-timeline-section"
import { SOUND_SCENE_ZOOM_LEVELS, soundSceneFitZoomIndex, soundSceneZoomIndex, soundSceneZoomLevel } from "@/features/sound-scene/engine/sound-scene-engine"
import { SoundSceneSession, useSoundSceneSession, type SoundClipRef } from "@/features/sound-scene/engine/sound-scene-session"
import { dbToGain, gainToDb } from "@/features/sound-scene/sound-scene-gain"
import { SoundSceneContextToolbar, type SoundContext } from "@/features/sound-scene/timeline/sound-scene-context-toolbar"
import { AudioTimelineSection, AudioTrackHeaders } from "./audio-timeline-section"
import { productionTimelineDurationMs } from "./timeline-duration"

import "@/features/sound-scene/timeline/sound-scene-workspace.css"
import "@/features/visual-scene/timeline/visual-scene.css"

export function acceptsSoundSceneShortcut(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  if (target.matches("[data-sound-shortcut-surface='true']")) return true
  return !target.closest("input, textarea, select, button, a[href], [contenteditable='true'], [role='slider'], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], [role='dialog']")
}

const SAMPLE_RATE = 48_000
const LANE_HEIGHT = 92
const RULER_HEIGHT = 38
const TICK_STEPS = [.1, .25, .5, 1, 2, 5, 10, 15, 30, 60]
const VIEWER_DEFAULT_WIDTH = 320
const VIEWER_MIN_WIDTH = 240
const VIEWER_MAX_WIDTH = 520
const VIEWER_WIDTH_STORAGE_KEY = "auvi.timeline.viewer-width"

type AddTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string }
type RemoveTarget = { clips: SoundClipRef[] }
type GestureMode = "move" | "left" | "right" | "gain" | "fade-in" | "fade-out"

function tickStep(pixelsPerSecond: number) {
  return TICK_STEPS.find((step) => step * pixelsPerSecond >= 70) || 60
}

export function TimelineWorkspace({ session, visual, onAddAudio, onRemoveClip, onRemoveTrack, onOpenSequence }: {
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
  onOpenSequence?: (partId: number) => void
}) {
  const { scene, engine, selection, playhead, playback, saving, error, soloTrackIds, playbackRange } = useSoundSceneSession(session)
  const visualState = useVisualSceneSession(visual?.session)
  const [tracksCollapsed, setTracksCollapsed] = useState(false)
  const [viewerCollapsed, setViewerCollapsed] = useState(false)
  const [viewerWidth, setViewerWidth] = useState(() => {
    if (typeof window === "undefined") return VIEWER_DEFAULT_WIDTH
    try {
      const stored = Number(window.localStorage.getItem(VIEWER_WIDTH_STORAGE_KEY))
      return Number.isFinite(stored) ? Math.min(VIEWER_MAX_WIDTH, Math.max(VIEWER_MIN_WIDTH, stored)) : VIEWER_DEFAULT_WIDTH
    } catch {
      return VIEWER_DEFAULT_WIDTH
    }
  })
  const [viewerResizing, setViewerResizing] = useState(false)
  const [snapGuide, setSnapGuide] = useState<number | null>(null)
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const [snapping, setSnapping] = useState(true)
  const [panning, setPanning] = useState(false)
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(920)
  const scrollRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const activeCancel = useRef<(() => void) | null>(null)
  const viewerResize = useRef<{ startX: number; startWidth: number } | null>(null)
  useEffect(() => {
    try { window.localStorage.setItem(VIEWER_WIDTH_STORAGE_KEY, String(Math.round(viewerWidth))) } catch { /* Browser storage is an optional preference only. */ }
  }, [viewerWidth])
  const total = Math.max(productionTimelineDurationMs(scene, visualState.document) / 1000, 1)
  const pixelsPerSecond = SAMPLE_RATE / engine.samplesPerPixel
  const zoomIndex = soundSceneZoomIndex(engine.samplesPerPixel)
  const width = Math.max(timelineViewportWidth, Math.ceil(total * pixelsPerSecond))
  const step = tickStep(pixelsPerSecond)
  const marks = useMemo(() => Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step), [step, total])
  const tracks = scene.resolved.tracks
  const visualTracks = visualState.document.tracks
  const hasVisualPlacements = visualTracks.some((track) => track.clips.length > 0)
  const imageTrackCount = visualTracks.filter((track) => track.media_type === "image").length
  const videoTrackCount = visualTracks.filter((track) => track.media_type === "video").length
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
  const selectedVideoAudio = selectedVisualClip ? tracks.flatMap((track) => track.clips.flatMap((clip) =>
    clip.linked_visual_clip_id === selectedVisualClip.id ? [{ trackId: track.id, clip }] : [])).at(0) : undefined
  const canSplitVisual = Boolean(selectedVisualRef && selectedVisualClip && visual?.session.canSplitVideo(selectedVisualRef, playhead * 1000, selectedVisualAsset))
  const lockedClipCount = selectedClips.filter(({ clip }) => clip.locked).length
  const context: SoundContext | null = selectedPart ? {
    kind: selectedPart.silence ? "silence" : "sequence",
    label: selectedPart.silence ? `Silence · ${formatDuration(selectedPart.duration_ms / 1000)}` : selectedPart.role || selectedPart.voice_name || selectedPart.title || `Part ${Number(selectedPart.position ?? 0) + 1}`,
    muted: selectedPart.mix.muted, gain: selectedPart.mix.gain, effects: selectedPart.mix.effects,
  } : selectedClips.length ? {
    kind: "audio", label: selectedClips.length === 1
      ? selectedClips[0]!.clip.asset_name || "Audio clip"
      : "Audio selection",
    count: selectedClips.length,
    muted: selectedClips.every(({ clip }) => clip.muted),
    lockState: lockedClipCount === 0 ? "unlocked" : lockedClipCount === selectedClips.length ? "locked" : "mixed",
    gain: selectedClips[0]!.clip.gain,
    gainMixed: selectedClips.some(({ clip }) => Math.abs(gainToDb(clip.gain) - gainToDb(selectedClips[0]!.clip.gain)) > .05),
    effects: selectedClips[0]!.clip.effects,
  } : null
  const canCrossfade = Boolean(session.crossfadeOverlap(selectedRefs))
  const canSplit = session.canSplitClipsAtPlayhead(selectedRefs, playhead)

  const snapTargets = useMemo(() => {
    const values = new Set<number>([0, playhead])
    scene.resolved.sequence_projection.spans.forEach((span) => {
      values.add(span.start_ms / 1000)
      values.add((span.start_ms + span.duration_ms) / 1000)
    })
    tracks.forEach((track) => track.clips.forEach((clip) => {
      if (clip.orphan) return
      const start = Number(clip.resolved_start_ms || 0) / 1000
      values.add(start)
      values.add(start + Number(clip.resolved_duration_ms || 0) / 1000)
    }))
    visualTracks.forEach((track) => track.clips.forEach((clip) => {
      values.add(clip.start_ms / 1000)
      values.add((clip.start_ms + clip.duration_ms) / 1000)
    }))
    return [...values].sort((left, right) => left - right)
  }, [playhead, scene.resolved.sequence_projection.spans, tracks, visualTracks])

  function snapped(value: number, bypass: boolean) {
    if (!snapping || bypass) { setSnapGuide(null); return value }
    const tolerance = 8 / pixelsPerSecond
    const nearest = snapTargets.reduce<number | null>((best, target) =>
      Math.abs(target - value) <= tolerance && (best === null || Math.abs(target - value) < Math.abs(best - value)) ? target : best, null)
    setSnapGuide(nearest)
    return nearest ?? value
  }

  function resizeViewer(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = viewerResize.current
    if (!active) return
    const stageWidth = event.currentTarget.parentElement?.clientWidth || VIEWER_MAX_WIDTH * 2
    const maximum = Math.min(VIEWER_MAX_WIDTH, Math.max(VIEWER_MIN_WIDTH, stageWidth * .46))
    setViewerWidth(Math.min(maximum, Math.max(VIEWER_MIN_WIDTH, active.startWidth + event.clientX - active.startX)))
  }

  function finishViewerResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!viewerResize.current) return
    resizeViewer(event)
    viewerResize.current = null
    setViewerResizing(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function adjustViewerWidth(delta: number) {
    setViewerWidth((current) => {
      const next = Math.min(VIEWER_MAX_WIDTH, Math.max(VIEWER_MIN_WIDTH, current + delta))
      return next
    })
  }

  function gesture(event: ReactPointerEvent, trackId: string, clipId: string, mode: GestureMode) {
    if (event.button !== 0 || saving) return
    event.stopPropagation()
    visual?.session.select(null)
    const grabbedWasSelected = selectedRefs.some((ref) => ref.trackId === trackId && ref.clipId === clipId)
    const preserveGroup = mode === "move" && grabbedWasSelected && selectedRefs.length > 1
    if (!preserveGroup)
      session.selectClip(trackId, clipId, event.shiftKey || event.metaKey || event.ctrlKey)
    const movingRefs = mode === "move"
      ? (preserveGroup ? selectedRefs : session.selectedClips())
      : [{ trackId, clipId }]
    const engineTrack = engine.tracks.find((track) => track.id === trackId)
    const initial = engineTrack?.clips.find((clip) => clip.id === clipId)
    const persisted = session.currentClip(trackId, clipId)
    if (!initial || !persisted) return
    if (mode === "move" && !session.canMoveClips(movingRefs)) return
    if (persisted.locked && ["left", "right"].includes(mode)) {
      session.reportError("Unlock this clip before trimming it.")
      return
    }
    const originX = event.clientX
    const originY = event.clientY
    let started = false
    let appliedSamples = 0
    let finished = false
    const begin = () => { if (!started) { started = true; session.beginGesture() } }
    const move = (next: PointerEvent) => {
      const dx = next.clientX - originX
      const dy = next.clientY - originY
      if (!started && Math.hypot(dx, dy) < 4) return
      begin()
      if (mode === "gain") {
        const initialDb = persisted.gain <= .001 ? -60 : 20 * Math.log10(persisted.gain)
        const gain = Math.min(2, Math.max(0, 10 ** (Math.max(-60, Math.min(6, initialDb - dy * .25)) / 20)))
        session.updateClip(trackId, clipId, { gain })
        return
      }
      if (mode === "fade-in" || mode === "fade-out") {
        const durationMs = Number(persisted.resolved_duration_ms || persisted.duration_ms || 0)
        const original = mode === "fade-in" ? persisted.fade_in_ms : persisted.fade_out_ms
        const milliseconds = Math.max(0, Math.min(durationMs, original + (mode === "fade-in" ? dx : -dx) / pixelsPerSecond * 1000))
        session.updateClip(trackId, clipId, { [mode === "fade-in" ? "fade_in_ms" : "fade_out_ms"]: Math.round(milliseconds) })
        return
      }
      const originalStart = initial.startSample / SAMPLE_RATE
      const originalEnd = (initial.startSample + initial.durationSamples) / SAMPLE_RATE
      let seconds = dx / pixelsPerSecond
      if (mode === "move") seconds = snapped(originalStart + seconds, next.altKey) - originalStart
      if (mode === "left") seconds = snapped(originalStart + seconds, next.altKey) - originalStart
      if (mode === "right") seconds = snapped(originalEnd + seconds, next.altKey) - originalEnd
      const targetSamples = Math.round(seconds * SAMPLE_RATE)
      const deltaSamples = targetSamples - appliedSamples
      appliedSamples = targetSamples
      if (mode === "move") session.moveClips(movingRefs, deltaSamples)
      else session.trimClip(trackId, clipId, mode, deltaSamples)
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", cancel)
      activeCancel.current = null
      setSnapGuide(null)
    }
    const finish = () => {
      if (finished) return
      finished = true; cleanup()
      if (started) void session.commitGesture()
    }
    const cancel = () => {
      if (finished) return
      finished = true; cleanup()
      if (started) session.cancelGesture()
    }
    activeCancel.current = cancel
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", cancel, { once: true })
    window.addEventListener("blur", cancel, { once: true })
  }

  function visualGesture(event: ReactPointerEvent, ref: VisualClipRef, mode: "move" | "start" | "end") {
    const visualSession = visual?.session
    const initial = visualSession?.currentClip(ref)
    if (!visualSession || !initial || event.button !== 0 || visualState.saving) return
    event.preventDefault()
    event.stopPropagation()
    const grabbedWasSelected = selectedVisualRefs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId)
    if (!(mode === "move" && grabbedWasSelected && selectedVisualRefs.length > 1))
      visualSession.selectClip(ref, event.shiftKey || event.metaKey || event.ctrlKey)
    session.select(null)
    if (initial.locked || visualTracks.find((track) => track.id === ref.trackId)?.locked) {
      visualSession.reportError("Unlock this visual before changing its timing.")
      return
    }
    const originX = event.clientX
    const originalStart = initial.start_ms
    const originalEnd = initial.start_ms + initial.duration_ms
    let started = false
    let finished = false
    const move = (next: PointerEvent) => {
      const dx = next.clientX - originX
      if (!started && Math.abs(dx) < 4) return
      if (!started) { started = true; visualSession.beginGesture() }
      const deltaMs = dx / pixelsPerSecond * 1000
      if (mode === "move") visualSession.moveClip(ref, snapped(originalStart / 1000 + deltaMs / 1000, next.altKey) * 1000)
      else if (mode === "start") visualSession.trimClip(ref, "start", snapped(originalStart / 1000 + deltaMs / 1000, next.altKey) * 1000, visual.assets.find((asset) => asset.id === initial.asset_id))
      else visualSession.trimClip(ref, "end", snapped(originalEnd / 1000 + deltaMs / 1000, next.altKey) * 1000, visual.assets.find((asset) => asset.id === initial.asset_id))
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", cancel)
      activeCancel.current = null
      setSnapGuide(null)
    }
    const finish = () => { if (finished) return; finished = true; cleanup(); if (started) void visualSession.commitGesture() }
    const cancel = () => { if (finished) return; finished = true; cleanup(); if (started) visualSession.cancelGesture() }
    activeCancel.current = cancel
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", cancel, { once: true })
    window.addEventListener("blur", cancel, { once: true })
  }

  function seekFromPointer(event: ReactPointerEvent) {
    const scroll = scrollRef.current
    if (!scroll) return
    let active = true
    const seek = (clientX: number) => {
      const rect = scroll.getBoundingClientRect()
      session.seek((clientX - rect.left + scroll.scrollLeft) / pixelsPerSecond)
    }
    seek(event.clientX)
    const move = (next: PointerEvent) => { if (active) seek(next.clientX) }
    const finish = () => { active = false; window.removeEventListener("pointermove", move) }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
  }

  function setZoomAt(clientX: number, nextIndex: number) {
    const scroll = scrollRef.current
    if (!scroll) return
    const boundedIndex = Math.max(0, Math.min(SOUND_SCENE_ZOOM_LEVELS.length - 1, nextIndex))
    if (boundedIndex === zoomIndex) return
    const rect = scroll.getBoundingClientRect()
    const pointer = clientX - rect.left
    const time = (scroll.scrollLeft + pointer) / pixelsPerSecond
    session.setZoomLevel(soundSceneZoomLevel(boundedIndex))
    requestAnimationFrame(() => {
      const nextPps = SAMPLE_RATE / session.snapshot().engine.samplesPerPixel
      scroll.scrollLeft = Math.max(0, time * nextPps - pointer)
    })
  }

  function setCenteredZoom(nextIndex: number) {
    const scroll = scrollRef.current
    if (!scroll) return
    const rect = scroll.getBoundingClientRect()
    setZoomAt(rect.left + rect.width / 2, nextIndex)
  }

  function fitTimeline() {
    const scroll = scrollRef.current
    if (!scroll) return
    session.setZoomLevel(soundSceneZoomLevel(soundSceneFitZoomIndex(total, scroll.clientWidth)))
    setFollowPlayhead(false)
    requestAnimationFrame(() => { scroll.scrollLeft = 0 })
  }

  function panTimeline(event: ReactPointerEvent) {
    const scroll = scrollRef.current
    if (!scroll || activeCancel.current || event.button !== 0 || event.target !== event.currentTarget) return
    event.preventDefault()
    const originX = event.clientX
    const originScroll = scroll.scrollLeft
    setPanning(true)
    setFollowPlayhead(false)
    const move = (next: PointerEvent) => { scroll.scrollLeft = originScroll - (next.clientX - originX) }
    const finish = () => {
      setPanning(false)
      activeCancel.current = null
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      window.removeEventListener("blur", finish)
    }
    activeCancel.current = finish
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", finish, { once: true })
    window.addEventListener("blur", finish, { once: true })
  }

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const resize = new ResizeObserver(([entry]) => setTimelineViewportWidth(Math.max(1, Math.floor(entry?.contentRect.width || scroll.clientWidth))))
    resize.observe(scroll)
    return () => resize.disconnect()
  }, [])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
        setZoomAt(event.clientX, zoomIndex + (event.deltaY < 0 ? 1 : -1))
        return
      }
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault()
        scroll.scrollLeft += event.shiftKey ? event.deltaY : event.deltaX
        setFollowPlayhead(false)
      }
    }
    scroll.addEventListener("wheel", wheel, { passive: false })
    return () => scroll.removeEventListener("wheel", wheel)
  })

  useEffect(() => {
    const scroll = scrollRef.current
    if (!followPlayhead || !scroll || session.snapshot().playback !== "playing") return
    const x = playhead * pixelsPerSecond
    if (x < scroll.scrollLeft + 80 || x > scroll.scrollLeft + scroll.clientWidth - 100)
      scroll.scrollTo({ left: Math.max(0, x - scroll.clientWidth * .32), behavior: "smooth" })
  }, [followPlayhead, pixelsPerSecond, playhead, session])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !acceptsSoundSceneShortcut(event.target)) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (selectedVisualRefs.length && visual) void (event.shiftKey ? visual.session.redo() : visual.session.undo())
        else void (event.shiftKey ? session.redo() : session.undo())
        return
      }
      if (command && event.key.toLowerCase() === "d" && selectedRefs.length) { event.preventDefault(); void session.duplicateClips(selectedRefs); return }
      if (command && event.key.toLowerCase() === "d" && selectedVisualRefs.length && visual) { event.preventDefault(); void visual.session.duplicateClips(selectedVisualRefs); return }
      if (event.key.toLowerCase() === "s" && selectedVisualRef && selectedVisualClip && visual && canSplitVisual) {
        event.preventDefault()
        void visual.session.splitVideo(selectedVisualRef, playhead * 1000, selectedVisualAsset)
        return
      }
      if (command && event.key.toLowerCase() === "l" && selectedRefs.length) { event.preventDefault(); setFollowPlayhead(true); void session.playSelection(true, selectedRefs); return }
      if (event.code === "Space") { event.preventDefault(); setFollowPlayhead(true); void session.togglePlayback(); return }
      if (event.key.toLowerCase() === "s" && selectedRefs.length && !command) { event.preventDefault(); void session.splitClipsAtPlayhead(selectedRefs); return }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && selectedRefs.length) {
        event.preventDefault()
        const amount = event.altKey ? 10 : event.shiftKey ? 1_000 : 100
        void session.nudgeClips((event.key === "ArrowLeft" ? -1 : 1) * amount, selectedRefs)
        return
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && selectedVisualRefs.length && visual) {
        event.preventDefault()
        const amount = event.altKey ? 10 : event.shiftKey ? 1_000 : 100
        void visual.session.nudgeClips(selectedVisualRefs, (event.key === "ArrowLeft" ? -1 : 1) * amount)
        return
      }
      if (event.key === "Home" || event.key === "0") { event.preventDefault(); session.seek(0); return }
      if (event.key === "-" || event.key === "_") { event.preventDefault(); setCenteredZoom(zoomIndex - 1); return }
      if (event.key === "=" || event.key === "+") { event.preventDefault(); setCenteredZoom(zoomIndex + 1); return }
      if (event.key === "Escape") { event.preventDefault(); if (activeCancel.current) activeCancel.current(); else { session.select(null); visual?.session.select(null) } return }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedClips.length) {
        event.preventDefault()
        if (!selectedClips.some(({ clip }) => clip.locked)) onRemoveClip({ clips: selectedRefs })
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedVisualRefs.length && selectedVisualClip && selectedVisualTrack && visual) {
        event.preventDefault()
        if (!selectedVisualRefs.some((ref) => visual.session.currentClip(ref)?.locked || visualState.document.tracks.find((track) => track.id === ref.trackId)?.locked))
          visual.onRemoveClip(selectedVisualRefs, selectedVisualRefs.length === 1 && selectedVisualAsset ? visualAssetName(selectedVisualAsset) : `${selectedVisualRefs.length} media clips`)
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [canSplitVisual, onRemoveClip, playhead, selectedClips, selectedRefs, selectedVisualAsset, selectedVisualClip, selectedVisualRef, selectedVisualRefs, selectedVisualTrack, session, visual, visualState.document.tracks, zoomIndex])

  return <section className={cn("sound-scene-workspace", hasVisualPlacements && "has-visual-monitor", viewerCollapsed && "viewer-collapsed", tracksCollapsed && "tracks-collapsed", panning && "is-panning")}>
    <TimelineToolbar
      summary={`${imageTrackCount} image track${imageTrackCount === 1 ? "" : "s"} · ${videoTrackCount} video track${videoTrackCount === 1 ? "" : "s"} · ${tracks.length} audio track${tracks.length === 1 ? "" : "s"} · ${formatDuration(total)}`}
      canUndo={selectedVisualRefs.length ? visualState.canUndo : scene.can_undo}
      canRedo={selectedVisualRefs.length ? visualState.canRedo : scene.can_redo}
      saving={saving || visualState.saving}
      snapping={snapping}
      followPlayhead={followPlayhead}
      hasVisualScene={Boolean(visual)}
      onUndo={() => void (selectedVisualRefs.length && visual ? visual.session.undo() : session.undo())}
      onRedo={() => void (selectedVisualRefs.length && visual ? visual.session.redo() : session.redo())}
      onMoveView={(direction) => { if (scrollRef.current) { scrollRef.current.scrollLeft += direction * scrollRef.current.clientWidth * .6; setFollowPlayhead(false) } }}
      onSnappingChange={(enabled) => { setSnapping(enabled); setSnapGuide(null) }}
      onFollowPlayheadChange={setFollowPlayhead}
      onAddVisual={() => visual?.onAddVisual()}
      onAddAudio={() => onAddAudio({ mode: "new-track" })}
    />
    <div className="sound-scene-stage" style={{ "--timeline-viewer-width": `${viewerWidth}px` } as CSSProperties}>
      {visual && hasVisualPlacements && <TimelineViewer document={visualState.document} assets={visual.assets} playheadMs={playhead * 1000} playback={playback} selection={selectedVisualRef} session={visual.session} saving={visualState.saving} collapsed={viewerCollapsed} onCollapsedChange={setViewerCollapsed} onAddMedia={() => visual.onAddVisual()} />}
      {visual && hasVisualPlacements && !viewerCollapsed && <button
        type="button"
        className={cn("timeline-viewer-resize-handle", viewerResizing && "is-resizing")}
        aria-label="Resize Viewer"
        aria-valuemin={VIEWER_MIN_WIDTH}
        aria-valuemax={VIEWER_MAX_WIDTH}
        aria-valuenow={Math.round(viewerWidth)}
        onDoubleClick={() => adjustViewerWidth(VIEWER_DEFAULT_WIDTH - viewerWidth)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          adjustViewerWidth(event.key === "ArrowLeft" ? -16 : 16)
        }}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          viewerResize.current = { startX: event.clientX, startWidth: viewerWidth }
          setViewerResizing(true)
        }}
        onPointerMove={resizeViewer}
        onPointerUp={finishViewerResize}
        onPointerCancel={finishViewerResize}
      />}
      <div className="sound-scene-editor">
      <aside ref={controlsRef} className="sound-scene-track-controls" style={{ gridTemplateRows: rowTemplate }} onWheel={(event) => { if (scrollRef.current) scrollRef.current.scrollTop += event.deltaY }}>
        <div className="sound-scene-track-head">
          <span>Tracks</span>
          <div className="sound-scene-track-head-actions">
            {!tracksCollapsed && <DropdownMenu><OperatorTooltip label="Create an empty Timeline track" detail="Choose the media type now, then add compatible sources inside that track."><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="New Timeline track"><Plus data-icon="inline-start" />New track</Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent side="right" align="start"><DropdownMenuLabel>Empty track</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuItem onSelect={() => void visual?.session.addTrack("image")} disabled={!visual}><ImageIcon /> Image</DropdownMenuItem><DropdownMenuItem onSelect={() => void visual?.session.addTrack("video")} disabled={!visual}><Film /> Video</DropdownMenuItem><DropdownMenuItem onSelect={() => void session.addTrack()}><AudioWaveform /> Audio</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}
            <OperatorTooltip label={tracksCollapsed ? "Show track controls" : "Hide track controls"}><Button variant="ghost" size="icon-sm" onClick={() => setTracksCollapsed((value) => !value)} aria-label={tracksCollapsed ? "Show track controls" : "Hide track controls"}>{tracksCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button></OperatorTooltip>
          </div>
        </div>
        <VisualTrackHeaders
          tracks={visualTracks}
          assets={visual?.assets || []}
          collapsed={tracksCollapsed}
          onVisible={(track) => void visual?.session.setTrackVisible(track.id, !track.visible)}
          onLocked={(track) => void visual?.session.setTrackLocked(track.id, !track.locked)}
          onAdd={(trackId) => visual?.onAddVisual(trackId)}
          onMove={(trackId, direction) => void visual?.session.moveTrack(trackId, direction)}
          onRename={(trackId, name) => void visual?.session.renameTrack(trackId, name)}
          onRemove={(track) => visual?.onRemoveTrack(track)}
        />
        <AudioTrackHeaders
          tracks={tracks}
          engineTracks={engine.tracks}
          collapsed={tracksCollapsed}
          soloTrackIds={soloTrackIds}
          sequenceSummary={sequenceSummary}
          onMute={(track) => void session.commitTrackMute(track.id, !track.muted)}
          onSolo={(track) => session.toggleTrackSolo(track.id)}
          onVolumeChange={(track, volume) => session.setTrackVolume(track.id, volume)}
          onVolumeCommit={(track, volume) => void session.commitTrackVolume(track.id, volume)}
          onAdd={(track) => onAddAudio({ mode: "add-clip", trackId: track.id })}
          onRemove={onRemoveTrack}
        />
      </aside>
      <div className="sound-scene-scroll" ref={scrollRef} onScroll={(event) => { if (controlsRef.current) controlsRef.current.scrollTop = event.currentTarget.scrollTop; if (session.snapshot().playback === "playing") setFollowPlayhead(false) }}>
        <div className="sound-scene-timeline" ref={timelineRef} style={{ width, gridTemplateRows: rowTemplate }} onPointerDown={panTimeline}>
          <TimelineRuler marks={marks} pixelsPerSecond={pixelsPerSecond} playhead={playhead} playbackRange={playbackRange} snapGuide={snapGuide} onSeek={seekFromPointer} />
          <VisualTimelineSection
            tracks={visualTracks}
            assets={visual?.assets || []}
            selection={selectedVisualRefs}
            styleFor={styleFor}
            onSelect={(event, ref) => { const modified = event.nativeEvent as MouseEvent | KeyboardEvent; visual?.session.selectClip(ref, modified.shiftKey || modified.metaKey || modified.ctrlKey); session.select(null) }}
            onGesture={visualGesture}
            onAdd={(trackId) => visual?.onAddVisual(trackId)}
            onPan={panTimeline}
          />
          <AudioTimelineSection
            scene={scene}
            tracks={tracks}
            engineTracks={engine.tracks}
            selection={selection}
            selectedRefs={selectedRefs}
            soloTrackIds={soloTrackIds}
            pixelsPerSecond={pixelsPerSecond}
            styleFor={styleFor}
            currentClip={(trackId, clipId) => session.currentClip(trackId, clipId)}
            onSelectPart={(partId) => { session.select({ kind: "part", id: partId }); visual?.session.select(null) }}
            onSelectClip={(event, trackId, clipId) => { session.selectClip(trackId, clipId, event.shiftKey || event.metaKey || event.ctrlKey); visual?.session.select(null) }}
            onGesture={gesture}
            onAdd={(trackId) => onAddAudio({ mode: "add-clip", trackId })}
            onPan={panTimeline}
          />
        </div>
      </div>
      <TimelineZoom index={zoomIndex} maximum={SOUND_SCENE_ZOOM_LEVELS.length - 1} pixelsPerSecond={pixelsPerSecond} onChange={setCenteredZoom} onFit={fitTimeline} />
      </div>
    </div>
    <footer className="sound-scene-context-bar">{selectedVisualRef && selectedVisualTrack && selectedVisualClip && visual ? <VisualContextToolbar count={selectedVisualRefs.length} track={selectedVisualTrack} clip={selectedVisualClip} asset={selectedVisualAsset} saving={visualState.saving || saving} canSplit={selectedVisualRefs.length === 1 && canSplitVisual} hasAudio={selectedVisualRefs.length === 1 && videoHasEmbeddedAudio(selectedVisualAsset)} audioMuted={selectedVideoAudio?.clip.muted} onAudioMute={selectedVisualRefs.length === 1 && selectedVideoAudio ? () => void session.commitClipChanges(selectedVideoAudio.trackId, selectedVideoAudio.clip.id, { muted: !selectedVideoAudio.clip.muted }) : undefined} onSplit={() => void visual.session.splitVideo(selectedVisualRef, playhead * 1000, selectedVisualAsset)} onLock={() => void visual.session.setClipsLocked(selectedVisualRefs, !selectedVisualRefs.every((ref) => visual.session.currentClip(ref)?.locked))} onDuplicate={() => void visual.session.duplicateClips(selectedVisualRefs)} onDelete={() => visual.onRemoveClip(selectedVisualRefs, selectedVisualRefs.length === 1 && selectedVisualAsset ? visualAssetName(selectedVisualAsset) : `${selectedVisualRefs.length} media clips`)} /> : context ? <SoundSceneContextToolbar
      context={context} saving={saving}
      onMute={() => {
        if (selectedPart) void session.updateSequenceOverride(selectedPart.part_public_id, { muted: !selectedPart.mix.muted })
        else void session.commitSelectedClipChanges({ muted: !context?.muted }, selectedRefs)
      }}
      onGainPreview={(gainDb, relative) => {
        if (relative) return
        const gain = dbToGain(gainDb)
        if (selectedPart) session.previewSequenceOverride(selectedPart.part_public_id, { gain })
        else if (selectedRefs[0]) session.updateClip(selectedRefs[0].trackId, selectedRefs[0].clipId, { gain })
      }}
      onGain={(gainDb, relative) => {
        if (relative) void session.commitSelectedClipGainDelta(gainDb, selectedRefs)
        else if (selectedPart) void session.updateSequenceOverride(selectedPart.part_public_id, { gain: dbToGain(gainDb) })
        else if (selectedRefs[0]) void session.commitClipChanges(selectedRefs[0].trackId, selectedRefs[0].clipId, { gain: dbToGain(gainDb) })
      }}
      onEffectsPreview={(effects) => {
        if (selectedPart) session.previewSequenceOverride(selectedPart.part_public_id, { effects })
        else if (selectedRefs[0]) session.updateClip(selectedRefs[0].trackId, selectedRefs[0].clipId, { effects })
      }}
      onEffects={(effects) => {
        if (selectedPart) void session.updateSequenceOverride(selectedPart.part_public_id, { effects })
        else if (selectedRefs[0]) void session.commitClipChanges(selectedRefs[0].trackId, selectedRefs[0].clipId, { effects })
      }}
      onLock={() => void session.commitSelectedClipChanges({ locked: context?.lockState !== "locked" }, selectedRefs)}
      canSplit={canSplit}
      onSplit={() => void session.splitClipsAtPlayhead(selectedRefs)}
      onDuplicate={() => void session.duplicateClips(selectedRefs)}
      onCrossfade={canCrossfade ? () => void session.crossfadeSelected(selectedRefs) : undefined}
      onPlaySelection={() => { setFollowPlayhead(true); void session.playSelection(false, selectedRefs) }}
      onLoopSelection={() => { setFollowPlayhead(true); void session.playSelection(true, selectedRefs) }}
      onDelete={() => onRemoveClip({ clips: selectedRefs })}
      onOptions={selectedClips.length === 1 || selectedPart ? () => document.querySelector(".ws-right-pane")?.scrollIntoView({ block: "nearest" }) : undefined}
      onOpenSequence={selectedPart ? () => onOpenSequence?.(selectedPart.part_id) : undefined}
    /> : <span className="sound-context-empty">Select a clip or Script Part to edit it</span>}
      {(error || visualState.error) && <div className="sound-context-feedback" role="alert" aria-live="assertive">
        <CircleAlert aria-hidden="true" />
        <OperatorTooltip label={error || visualState.error} side="top"><span>{error || visualState.error}</span></OperatorTooltip>
        <OperatorIconButton label="Dismiss Timeline message" onClick={() => { session.clearError(); visual?.session.clearError() }}><X /></OperatorIconButton>
      </div>}
    </footer>
  </section>
}
