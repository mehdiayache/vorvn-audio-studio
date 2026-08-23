import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { ChevronLeft, ChevronRight, LocateFixed, Lock, Maximize2, Minus, MoreHorizontal, Music2, PanelLeftClose, PanelLeftOpen, Pause, Plus, RadioTower, Redo2, Trash2, Undo2, Volume1, Volume2, VolumeX } from "lucide-react"

import { useAudioPeaks } from "@/components/audio-waveform"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SoundSceneClip, SoundSceneTrack } from "@/types/domain"
import { SOUND_SCENE_ZOOM_LEVELS, soundSceneFitZoomIndex, soundSceneZoomIndex, soundSceneZoomLevel } from "../engine/sound-scene-engine"
import { SoundSceneSession, useSoundSceneSession, type SoundClipRef } from "../engine/sound-scene-session"
import { dbToGain, formatDb, gainToDb, MAX_GAIN_DB, MIN_GAIN_DB } from "../sound-scene-gain"
import { SoundSceneContextToolbar, type SoundContext } from "./sound-scene-context-toolbar"

import "./sound-scene-workspace.css"

const SAMPLE_RATE = 48_000
const LANE_HEIGHT = 92
const RULER_HEIGHT = 38
const PEAK_TIERS = [128, 256, 512, 1024, 2048, 4096] as const
const TICK_STEPS = [.1, .25, .5, 1, 2, 5, 10, 15, 30, 60]

type AddTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string }
type RemoveTarget = { clips: SoundClipRef[] }
type GestureMode = "move" | "left" | "right" | "gain" | "fade-in" | "fade-out"

function roleColor(role?: string | null) {
  const palette = ["violet", "blue", "teal", "amber", "rose"]
  const hash = Array.from(String(role || "voice")).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function CanvasWaveform({ url }: { url?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tier, setTier] = useState<number>(128)
  const peaks = useAudioPeaks(url, tier)
  useEffect(() => {
    const node = canvas.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.ceil(entry?.contentRect.width || 1))
      setTier(PEAK_TIERS.find((value) => value >= width) || 4096)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [Boolean(peaks?.length)])
  useEffect(() => {
    const node = canvas.current
    if (!node || !peaks?.length) return
    const draw = () => {
      const rect = node.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      node.width = Math.max(1, Math.round(rect.width * ratio))
      node.height = Math.max(1, Math.round(rect.height * ratio))
      const context = node.getContext("2d")
      if (!context) return
      context.clearRect(0, 0, node.width, node.height)
      context.fillStyle = getComputedStyle(node).color
      context.globalAlpha = .62
      const bar = Math.max(1, node.width / peaks.length)
      peaks.forEach((peak, index) => {
        const height = peak * node.height * .82
        if (height <= 0) return
        context.fillRect(index * bar, (node.height - height) / 2, Math.max(1, bar * .56), height)
      })
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(node)
    return () => observer.disconnect()
  }, [peaks])
  if (!url || peaks?.length === 0) return <span className="sound-scene-waveform-state is-unavailable" aria-hidden="true">Waveform unavailable</span>
  if (!peaks) return <span className="sound-scene-waveform-state is-loading" aria-hidden="true"><i /><i /><i /><i /></span>
  return <canvas ref={canvas} className="sound-scene-waveform" aria-hidden="true" />
}

function tickStep(pixelsPerSecond: number) {
  return TICK_STEPS.find((step) => step * pixelsPerSecond >= 70) || 60
}

function SoundTrackControl({ track, volume, collapsed, onMute, onVolumeChange, onVolumeCommit, onAdd, onRemove }: {
  track: SoundSceneTrack
  volume: number
  collapsed: boolean
  onMute: () => void
  onVolumeChange: (volume: number) => void
  onVolumeCommit: (volume: number) => void
  onAdd: () => void
  onRemove: () => void
}) {
  const volumeDb = gainToDb(volume)
  const summary = `${track.name} · ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"} · ${track.muted ? "Muted" : formatDb(volumeDb)}`
  return <div className={cn("sound-track-control", collapsed && "is-compact")}>
    <div className="sound-track-select" title={summary}>
      <span className={cn("sound-track-icon is-music", track.muted && "is-muted")}><Music2 /></span>
      {!collapsed && <span className="sound-track-copy"><b>{track.name}</b><small>{track.clips.length} clip{track.clips.length === 1 ? "" : "s"}</small></span>}
    </div>
    {collapsed ? <div className="sound-track-compact-actions">
      <Popover>
        <OperatorTooltip label={`Adjust ${track.name} gain`} detail={track.muted ? `Muted now · ${formatDb(volumeDb)} will apply when unmuted.` : formatDb(volumeDb)}><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Adjust ${track.name} gain`}>{track.muted ? <VolumeX /> : <Volume1 />}</Button></PopoverTrigger></OperatorTooltip>
        <PopoverContent side="right" align="center" className="sound-track-volume-popover">
          <header><span><b>{track.name}</b><small>Track gain</small></span><strong>{track.muted ? `Muted · ${formatDb(volumeDb)}` : formatDb(volumeDb)}</strong></header>
          <Slider aria-label={`${track.name} gain`} value={[volumeDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => onVolumeChange(dbToGain(value))} onValueCommit={([value = 0]) => onVolumeCommit(dbToGain(value))} />
          <Button variant="ghost" size="sm" onClick={onMute}>{track.muted ? <Volume2 /> : <VolumeX />}{track.muted ? "Unmute track" : "Mute track"}</Button>
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <OperatorTooltip label={`More actions for ${track.name}`} detail="Add an Audio Library clip or permanently remove this track."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Track actions for ${track.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip>
        <DropdownMenuContent side="right" align="center">
          <DropdownMenuItem onSelect={onAdd}><Plus /> Add audio clip</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Remove “{track.name}”</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div> : <div className="sound-track-mix">
      <OperatorIconButton label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`} detail="Changes this Sound Design track without changing Sequence Parts." onClick={onMute}>{track.muted ? <VolumeX /> : <Volume2 />}</OperatorIconButton>
      <Slider aria-label={`${track.name} gain`} value={[volumeDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => onVolumeChange(dbToGain(value))} onValueCommit={([value = 0]) => onVolumeCommit(dbToGain(value))} />
      <OperatorIconButton label={`Add audio clip to ${track.name}`} onClick={onAdd}><Plus /></OperatorIconButton>
      <OperatorIconButton label={`Remove ${track.name}`} detail={`Permanently removes the track and its ${track.clips.length} placement${track.clips.length === 1 ? "" : "s"}.`} onClick={onRemove}><Trash2 /></OperatorIconButton>
    </div>}
  </div>
}

export function SoundSceneWorkspace({ session, onAddAudio, onRemoveClip, onRemoveTrack, onOpenSequence }: {
  session: SoundSceneSession
  onAddAudio: (target: AddTarget) => void
  onRemoveClip: (target: RemoveTarget) => void
  onRemoveTrack: (track: SoundSceneTrack) => void
  onOpenSequence?: (partId: number) => void
}) {
  const { scene, engine, selection, playhead, saving, error } = useSoundSceneSession(session)
  const [tracksCollapsed, setTracksCollapsed] = useState(false)
  const [snapGuide, setSnapGuide] = useState<number | null>(null)
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const [panning, setPanning] = useState(false)
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(920)
  const scrollRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const activeCancel = useRef<(() => void) | null>(null)
  const total = Math.max(Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1000, 1)
  const pixelsPerSecond = SAMPLE_RATE / engine.samplesPerPixel
  const zoomIndex = soundSceneZoomIndex(engine.samplesPerPixel)
  const width = Math.max(timelineViewportWidth, Math.ceil(total * pixelsPerSecond))
  const step = tickStep(pixelsPerSecond)
  const marks = useMemo(() => Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step), [step, total])
  const tracks = scene.resolved.tracks
  const pauseCount = scene.resolved.sequence_projection.spans.filter((span) => span.silence).length
  const audioCount = scene.resolved.sequence_projection.spans.length - pauseCount
  const sequenceSummary = `${audioCount} audio · ${pauseCount} pause${pauseCount === 1 ? "" : "s"}`
  const trackById = new Map(engine.tracks.map((track) => [track.id, track]))
  const sequence = trackById.get("sequence-projection")
  const rowTemplate = `${RULER_HEIGHT}px repeat(${tracks.length + 1}, ${LANE_HEIGHT}px)`
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
    return [...values].sort((left, right) => left - right)
  }, [playhead, scene.resolved.sequence_projection.spans, tracks])

  function snapped(value: number, bypass: boolean) {
    if (bypass) { setSnapGuide(null); return value }
    const tolerance = 8 / pixelsPerSecond
    const nearest = snapTargets.reduce<number | null>((best, target) =>
      Math.abs(target - value) <= tolerance && (best === null || Math.abs(target - value) < Math.abs(best - value)) ? target : best, null)
    setSnapGuide(nearest)
    return nearest ?? value
  }

  function gesture(event: ReactPointerEvent, trackId: string, clipId: string, mode: GestureMode) {
    if (event.button !== 0 || saving) return
    event.stopPropagation()
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
      const target = event.target
      const editing = target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']")
      if (editing) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); void (event.shiftKey ? session.redo() : session.undo()); return }
      if (event.code === "Space") { event.preventDefault(); setFollowPlayhead(true); void session.togglePlayback(); return }
      if (event.key === "Home" || event.key === "0") { event.preventDefault(); session.seek(0); return }
      if (event.key === "-" || event.key === "_") { event.preventDefault(); setCenteredZoom(zoomIndex - 1); return }
      if (event.key === "=" || event.key === "+") { event.preventDefault(); setCenteredZoom(zoomIndex + 1); return }
      if (event.key === "Escape") { event.preventDefault(); if (activeCancel.current) activeCancel.current(); else session.select(null); return }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedClips.length) {
        event.preventDefault()
        if (!selectedClips.some(({ clip }) => clip.locked)) onRemoveClip({ clips: selectedRefs })
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [onRemoveClip, selectedClips, selectedRefs, session])

  return <section className={cn("sound-scene-workspace", tracksCollapsed && "tracks-collapsed", panning && "is-panning")}>
    <div className="sound-scene-toolbar">
      <OperatorTooltip label={tracksCollapsed ? "Show track controls" : "Hide track controls"}><Button variant="ghost" size="icon-sm" onClick={() => setTracksCollapsed((value) => !value)} aria-label={tracksCollapsed ? "Show track controls" : "Hide track controls"}>{tracksCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button></OperatorTooltip>
      <span className="sound-scene-toolbar-title"><b>Sound Design</b><small>{tracks.length} track{tracks.length === 1 ? "" : "s"} · {formatDuration(total)}</small></span>
      <div className="sound-scene-history"><OperatorTooltip label="Undo the last Sound Design edit" disabledTrigger={!scene.can_undo || saving}><Button variant="ghost" size="sm" disabled={!scene.can_undo || saving} onClick={() => void session.undo()} aria-label="Undo Sound edit"><Undo2 /><span>Undo</span></Button></OperatorTooltip><OperatorTooltip label="Redo the last undone Sound Design edit" disabledTrigger={!scene.can_redo || saving}><Button variant="ghost" size="sm" disabled={!scene.can_redo || saving} onClick={() => void session.redo()} aria-label="Redo Sound edit"><Redo2 /><span>Redo</span></Button></OperatorTooltip></div>
      <div className="sound-scene-viewport-tools">
        <OperatorTooltip label="Move one view earlier"><Button variant="ghost" size="icon-sm" aria-label="Previous view" onClick={() => { if (scrollRef.current) { scrollRef.current.scrollLeft -= scrollRef.current.clientWidth * .6; setFollowPlayhead(false) } }}><ChevronLeft /></Button></OperatorTooltip>
        <div className="sound-scene-zoom"><OperatorTooltip label="Zoom out" disabledTrigger={zoomIndex === 0}><Button variant="ghost" size="icon-sm" disabled={zoomIndex === 0} onClick={() => setCenteredZoom(zoomIndex - 1)} aria-label="Zoom out"><Minus /></Button></OperatorTooltip><Slider aria-label="Timeline zoom" aria-valuetext={`${Math.round(pixelsPerSecond)} pixels per second`} value={[zoomIndex]} min={0} max={SOUND_SCENE_ZOOM_LEVELS.length - 1} step={1} onValueChange={([value = zoomIndex]) => setCenteredZoom(value)} /><OperatorTooltip label="Zoom in" disabledTrigger={zoomIndex === SOUND_SCENE_ZOOM_LEVELS.length - 1}><Button variant="ghost" size="icon-sm" disabled={zoomIndex === SOUND_SCENE_ZOOM_LEVELS.length - 1} onClick={() => setCenteredZoom(zoomIndex + 1)} aria-label="Zoom in"><Plus /></Button></OperatorTooltip></div>
        <OperatorTooltip label="Move one view later"><Button variant="ghost" size="icon-sm" aria-label="Next view" onClick={() => { if (scrollRef.current) { scrollRef.current.scrollLeft += scrollRef.current.clientWidth * .6; setFollowPlayhead(false) } }}><ChevronRight /></Button></OperatorTooltip>
        <OperatorTooltip label="Fit the entire Production in view"><Button variant="ghost" size="sm" onClick={fitTimeline} aria-label="Fit entire timeline"><Maximize2 /><span>Fit</span></Button></OperatorTooltip>
        <OperatorTooltip label="Keep the playhead visible during playback"><Button variant="ghost" size="sm" className={followPlayhead ? "is-active" : undefined} aria-pressed={followPlayhead} onClick={() => setFollowPlayhead((value) => !value)}><LocateFixed /><span>Follow</span></Button></OperatorTooltip>
      </div>
      <span className="sound-scene-save-state">{saving && <b>Saving…</b>}{error && <b className="is-error" role="alert">{error}</b>}</span>
      <Button variant="outline" size="sm" onClick={() => onAddAudio({ mode: "new-track" })}><Plus /> Audio Track</Button>
    </div>
    <div className="sound-scene-editor">
      <aside ref={controlsRef} className="sound-scene-track-controls" style={{ gridTemplateRows: rowTemplate }} onWheel={(event) => { if (scrollRef.current) scrollRef.current.scrollTop += event.deltaY }}>
        <div className="sound-scene-track-head"><span>Tracks</span></div>
        <div className="sound-sequence-control" title={tracksCollapsed ? `Sequence · ${sequenceSummary}` : undefined}><span className="sound-track-icon is-sequence"><Volume2 /></span>{!tracksCollapsed && <span className="sound-track-copy"><b>Sequence</b><small>{sequenceSummary}</small></span>}</div>
        {tracks.map((track) => <SoundTrackControl
          key={track.id} track={track} collapsed={tracksCollapsed}
          volume={trackById.get(track.id)?.volume ?? track.volume}
          onMute={() => void session.commitTrackMute(track.id, !track.muted)}
          onVolumeChange={(volume) => session.setTrackVolume(track.id, volume)}
          onVolumeCommit={(volume) => void session.commitTrackVolume(track.id, volume)}
          onAdd={() => onAddAudio({ mode: "add-clip", trackId: track.id })}
          onRemove={() => onRemoveTrack(track)}
        />)}
      </aside>
      <div className="sound-scene-scroll" ref={scrollRef} onScroll={(event) => { if (controlsRef.current) controlsRef.current.scrollTop = event.currentTarget.scrollTop; if (session.snapshot().playback === "playing") setFollowPlayhead(false) }}>
        <div className="sound-scene-timeline" ref={timelineRef} style={{ width, gridTemplateRows: rowTemplate }} onPointerDown={panTimeline}>
          <div className="sound-scene-grid" aria-hidden="true">{marks.map((mark) => <i key={mark} style={{ left: mark * pixelsPerSecond }} />)}</div>
          <div className="sound-scene-ruler" onPointerDown={seekFromPointer}>{marks.map((mark) => <span key={mark} style={{ left: mark * pixelsPerSecond }}>{formatDuration(mark)}</span>)}</div>
          <div className="sound-scene-playhead" style={{ left: playhead * pixelsPerSecond }}><i /></div>
          {snapGuide !== null && <div className="sound-scene-snap-guide" style={{ left: snapGuide * pixelsPerSecond }} />}
          <div className="sound-scene-lane is-sequence" onPointerDown={panTimeline}>
            {scene.resolved.sequence_projection.spans.map((span) => {
              const clip = sequence?.clips.find((item) => item.id === `sequence:${span.part_public_id}`)
              const start = Number(clip?.startSample || 0) / SAMPLE_RATE
              const duration = Number(clip?.durationSamples || 0) / SAMPLE_RATE
              if (span.silence) {
                const width = duration * pixelsPerSecond
                const partNumber = String(Number(span.position ?? 0) + 1).padStart(2, "0")
                return <button key={span.part_public_id} className={cn("sound-sequence-silence", selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration)} onClick={() => session.select({ kind: "part", id: span.part_id })} aria-label={`Pause Part ${partNumber} · ${duration.toFixed(1)} seconds`} title={`Part ${partNumber} · Pause ${duration.toFixed(1)} seconds`}>
                  {width >= 28 && <span><Pause />{width >= 54 && <b>{duration.toFixed(1)}s</b>}</span>}
                </button>
              }
              const activeEffects = span.mix.effects.filter((effect) => effect.enabled).length
              return <button key={span.part_public_id} className={cn("sound-sequence-clip", `is-${roleColor(span.role)}`, selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration, 18)} onClick={() => session.select({ kind: "part", id: span.part_id })}><CanvasWaveform url={span.filename ? audioUrl(span.filename) : undefined} /><span><em>{String(Number(span.position ?? 0) + 1).padStart(2, "0")}</em><b>{span.role || span.voice_name || span.title || "Speech"}</b></span>{(span.mix.muted || activeEffects > 0) && <span className="sound-clip-states">{span.mix.muted && <i title="Muted"><VolumeX /></i>}{activeEffects > 0 && <i title={`${activeEffects} active effect${activeEffects === 1 ? "" : "s"}`}><RadioTower /><b>{activeEffects}</b></i>}</span>}</button>
            })}
          </div>
          {tracks.map((track) => {
            const engineTrack = trackById.get(track.id)
            return <div className={cn("sound-scene-lane is-music", track.muted && "is-muted")} key={track.id} onPointerDown={panTimeline}>
              {track.clips.map((clip) => {
                const current = engineTrack?.clips.find((item) => item.id === clip.id)
                if (!current || clip.orphan) return null
                const start = current.startSample / SAMPLE_RATE
                const duration = current.durationSamples / SAMPLE_RATE
                const selected = selectedRefs.some((ref) => ref.trackId === track.id && ref.clipId === clip.id)
                const live = selected ? session.currentClip(track.id, clip.id) || clip : clip
                const activeEffects = live.effects.filter((effect) => effect.enabled).length
                const fadeIn = Math.min(duration, live.fade_in_ms / 1000)
                const fadeOut = Math.min(duration, live.fade_out_ms / 1000)
                const gainHeight = Math.max(8, Math.min(82, 50 - (20 * Math.log10(Math.max(.001, live.gain))) * 1.25))
                return <div key={clip.id} role="button" tabIndex={0} className={cn("sound-music-clip", selected && "is-selected", live.locked && "is-locked")} style={styleFor(start, duration, 24)} onPointerDown={(event) => gesture(event, track.id, clip.id, "move")} onClick={(event) => { if (event.detail === 0) session.selectClip(track.id, clip.id, event.shiftKey || event.metaKey || event.ctrlKey) }} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); session.selectClip(track.id, clip.id, event.shiftKey || event.metaKey || event.ctrlKey) }}>
                  <CanvasWaveform url={clip.filename ? audioUrl(clip.filename) : undefined} />
                  <span className="sound-music-label"><Music2 /><span><b>{clip.asset_name || track.name}</b><small>{formatDb(gainToDb(live.gain))}</small></span></span>
                  {(live.locked || live.muted || activeEffects > 0) && <span className="sound-clip-states">{live.locked && <i title="Locked"><Lock /></i>}{live.muted && <i title="Muted"><VolumeX /></i>}{activeEffects > 0 && <i title={`${activeEffects} active effect${activeEffects === 1 ? "" : "s"}`}><RadioTower /><b>{activeEffects}</b></i>}</span>}
                  {selected && !live.locked && <>
                    <OperatorTooltip label="Trim clip start" detail="Drag to change the used source window."><button className="sound-trim-handle is-start" aria-label="Trim start" onPointerDown={(event) => gesture(event, track.id, clip.id, "left")} /></OperatorTooltip>
                    <OperatorTooltip label="Trim clip end" detail="Drag to change the audible duration."><button className="sound-trim-handle is-end" aria-label="Trim end" onPointerDown={(event) => gesture(event, track.id, clip.id, "right")} /></OperatorTooltip>
                    <div className="sound-gain-line" style={{ top: gainHeight }} onPointerDown={(event) => gesture(event, track.id, clip.id, "gain")}><i /></div>
                    <svg className="sound-fade-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M 0 100 L ${fadeIn / duration * 100} 0 L ${100 - fadeOut / duration * 100} 0 L 100 100`} /></svg>
                    <OperatorTooltip label="Adjust fade in" detail="Drag to shape how this clip enters."><button className="sound-fade-handle is-in" style={{ left: `${fadeIn / duration * 100}%` }} aria-label="Fade in" onPointerDown={(event) => gesture(event, track.id, clip.id, "fade-in")} /></OperatorTooltip>
                    <OperatorTooltip label="Adjust fade out" detail="Drag to shape how this clip leaves."><button className="sound-fade-handle is-out" style={{ left: `${(1 - fadeOut / duration) * 100}%` }} aria-label="Fade out" onPointerDown={(event) => gesture(event, track.id, clip.id, "fade-out")} /></OperatorTooltip>
                  </>}
                </div>
              })}
              {!track.clips.length && <button className="sound-empty-lane" onClick={() => onAddAudio({ mode: "add-clip", trackId: track.id })}><Plus /> Add audio clip</button>}
            </div>
          })}
        </div>
      </div>
    </div>
    <footer className="sound-scene-context-bar">{context ? <SoundSceneContextToolbar
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
      onDuplicate={() => void session.duplicateClips(selectedRefs)}
      onDelete={() => onRemoveClip({ clips: selectedRefs })}
      onOptions={selectedClips.length === 1 || selectedPart ? () => document.querySelector(".ws-right-pane")?.scrollIntoView({ block: "nearest" }) : undefined}
      onOpenSequence={selectedPart ? () => onOpenSequence?.(selectedPart.part_id) : undefined}
    /> : <span className="sound-context-empty">Select a clip or Sequence Part to edit it</span>}</footer>
  </section>
}
