import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react"
import { ChevronLeft, ChevronRight, Clock3, Minus, Music2, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Trash2, Undo2, Volume2, VolumeX } from "lucide-react"

import { useAudioPeaks } from "@/components/audio-waveform"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SoundSceneClip } from "@/types/domain"
import { SoundSceneSession, useSoundSceneSession } from "../engine/sound-scene-session"

import "./sound-scene-workspace.css"

const SAMPLE_RATE = 48_000
const LANE_HEIGHT = 92
const RULER_HEIGHT = 38
const PEAK_TIERS = [128, 256, 512, 1024, 2048, 4096] as const
const TICK_STEPS = [.1, .25, .5, 1, 2, 5, 10, 15, 30, 60]

type AddTarget = { mode: "new-track" } | { mode: "add-clip"; trackId: string }
type RemoveTarget = { trackId: string; clipId: string }
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
  }, [])
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
  return <canvas ref={canvas} className="sound-scene-waveform" aria-hidden="true" />
}

function decibels(gain: number) {
  return gain <= .001 ? "−∞ dB" : `${(20 * Math.log10(gain)).toFixed(1)} dB`
}

function tickStep(pixelsPerSecond: number) {
  return TICK_STEPS.find((step) => step * pixelsPerSecond >= 70) || 60
}

export function SoundSceneWorkspace({ session, onAddMusic, onRemoveClip, onRemoveTrack }: {
  session: SoundSceneSession
  onAddMusic: (target: AddTarget) => void
  onRemoveClip: (target: RemoveTarget) => void
  onRemoveTrack: (trackId: string) => void
}) {
  const { scene, engine, selection, playhead, saving, error } = useSoundSceneSession(session)
  const [tracksCollapsed, setTracksCollapsed] = useState(false)
  const [snapGuide, setSnapGuide] = useState<number | null>(null)
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const activeCancel = useRef<(() => void) | null>(null)
  const total = Math.max(Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1000, 1)
  const pixelsPerSecond = SAMPLE_RATE / engine.samplesPerPixel
  const width = Math.max(920, Math.ceil(total * pixelsPerSecond))
  const step = tickStep(pixelsPerSecond)
  const marks = useMemo(() => Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step), [step, total])
  const tracks = scene.resolved.tracks
  const trackById = new Map(engine.tracks.map((track) => [track.id, track]))
  const sequence = trackById.get("sequence-projection")
  const rowTemplate = `${RULER_HEIGHT}px repeat(${tracks.length + 1}, ${LANE_HEIGHT}px)`
  const styleFor = (start: number, duration: number, minimum = 2) => ({ left: start * pixelsPerSecond, width: Math.max(duration * pixelsPerSecond, minimum) } as CSSProperties)

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
    session.select({ kind: "clip", trackId, clipId })
    const engineTrack = engine.tracks.find((track) => track.id === trackId)
    const initial = engineTrack?.clips.find((clip) => clip.id === clipId)
    const persisted = session.currentClip(trackId, clipId)
    if (!initial || !persisted) return
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
      if (mode === "move") session.moveClip(trackId, clipId, deltaSamples)
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

  function zoomAt(clientX: number, direction: number) {
    const scroll = scrollRef.current
    if (!scroll) return
    const rect = scroll.getBoundingClientRect()
    const pointer = clientX - rect.left
    const time = (scroll.scrollLeft + pointer) / pixelsPerSecond
    direction > 0 ? session.zoomIn() : session.zoomOut()
    requestAnimationFrame(() => {
      const nextPps = SAMPLE_RATE / session.snapshot().engine.samplesPerPixel
      scroll.scrollLeft = Math.max(0, time * nextPps - pointer)
    })
  }

  function wheel(event: ReactWheelEvent) {
    const scroll = scrollRef.current
    if (!scroll) return
    if (event.ctrlKey) {
      event.preventDefault()
      zoomAt(event.clientX, event.deltaY < 0 ? 1 : -1)
      return
    }
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault()
      scroll.scrollLeft += event.shiftKey ? event.deltaY : event.deltaX
      setFollowPlayhead(false)
    }
  }

  useEffect(() => {
    const scroll = scrollRef.current
    if (!followPlayhead || !scroll || !session.snapshot().playing) return
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
      if (event.key === "-" || event.key === "_") { event.preventDefault(); session.zoomOut(); return }
      if (event.key === "=" || event.key === "+") { event.preventDefault(); session.zoomIn(); return }
      if (event.key === "Escape") { event.preventDefault(); if (activeCancel.current) activeCancel.current(); else session.select(null); return }
      if ((event.key === "Delete" || event.key === "Backspace") && selection?.kind === "clip") {
        event.preventDefault(); onRemoveClip({ trackId: selection.trackId, clipId: selection.clipId })
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [onRemoveClip, selection, session])

  return <section className={cn("sound-scene-workspace", tracksCollapsed && "tracks-collapsed")}>
    <div className="sound-scene-toolbar">
      <Button variant="ghost" size="icon-sm" onClick={() => setTracksCollapsed((value) => !value)} aria-label={tracksCollapsed ? "Show track controls" : "Hide track controls"}>{tracksCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
      <span className="sound-scene-toolbar-title">Sound Design</span>
      <div className="sound-scene-history"><Button variant="ghost" size="icon-sm" disabled={!scene.can_undo || saving} onClick={() => void session.undo()} aria-label="Undo Sound edit"><Undo2 /></Button><Button variant="ghost" size="icon-sm" disabled={!scene.can_redo || saving} onClick={() => void session.redo()} aria-label="Redo Sound edit"><Redo2 /></Button></div>
      <div className="sound-scene-zoom"><Button variant="ghost" size="icon-sm" disabled={!engine.canZoomOut} onClick={() => session.zoomOut()} aria-label="Zoom out"><Minus /></Button><span>{Math.round(pixelsPerSecond)} px/s</span><Button variant="ghost" size="icon-sm" disabled={!engine.canZoomIn} onClick={() => session.zoomIn()} aria-label="Zoom in"><Plus /></Button></div>
      <Button variant="outline" size="sm" onClick={() => onAddMusic({ mode: "new-track" })}><Plus /> Music track</Button>
    </div>
    <div className="sound-scene-editor">
      <aside ref={controlsRef} className="sound-scene-track-controls" style={{ gridTemplateRows: rowTemplate }} onWheel={(event) => { if (scrollRef.current) scrollRef.current.scrollTop += event.deltaY }}>
        <div className="sound-scene-track-head"><span>Tracks</span></div>
        <div className="sound-sequence-control"><span className="sound-track-icon is-sequence"><Volume2 /></span><span className="sound-track-copy"><b>Sequence</b><small>{scene.resolved.sequence_projection.spans.length} audible Parts</small></span></div>
        {tracks.map((track) => <div className="sound-track-control" key={track.id}>
          <div className="sound-track-select"><span className="sound-track-icon is-music"><Music2 /></span><span className="sound-track-copy"><b>{track.name}</b><small>{track.clips.length} clip{track.clips.length === 1 ? "" : "s"}</small></span></div>
          <div className="sound-track-mix"><Button variant="ghost" size="icon-sm" aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`} onClick={() => void session.commitTrackMute(track.id, !track.muted)}>{track.muted ? <VolumeX /> : <Volume2 />}</Button><Slider aria-label={`${track.name} volume`} value={[Math.round((trackById.get(track.id)?.volume ?? track.volume) * 100)]} max={200} step={1} onValueChange={([value = 0]) => session.setTrackVolume(track.id, value / 100)} onValueCommit={([value = 0]) => void session.commitTrackVolume(track.id, value / 100)} /><Button variant="ghost" size="icon-sm" aria-label={`Add clip to ${track.name}`} onClick={() => onAddMusic({ mode: "add-clip", trackId: track.id })}><Plus /></Button><Button variant="ghost" size="icon-sm" aria-label={`Remove ${track.name}`} onClick={() => onRemoveTrack(track.id)}><Trash2 /></Button></div>
        </div>)}
      </aside>
      <div className="sound-scene-scroll" ref={scrollRef} onWheel={wheel} onScroll={(event) => { if (controlsRef.current) controlsRef.current.scrollTop = event.currentTarget.scrollTop; if (session.snapshot().playing) setFollowPlayhead(false) }}>
        <div className="sound-scene-timeline" ref={timelineRef} style={{ width, gridTemplateRows: rowTemplate }}>
          <div className="sound-scene-grid" aria-hidden="true">{marks.map((mark) => <i key={mark} style={{ left: mark * pixelsPerSecond }} />)}</div>
          <div className="sound-scene-ruler" onPointerDown={seekFromPointer}>{marks.map((mark) => <span key={mark} style={{ left: mark * pixelsPerSecond }}>{formatDuration(mark)}</span>)}</div>
          <div className="sound-scene-playhead" style={{ left: playhead * pixelsPerSecond }}><i /></div>
          {snapGuide !== null && <div className="sound-scene-snap-guide" style={{ left: snapGuide * pixelsPerSecond }} />}
          <div className="sound-scene-lane is-sequence">
            {scene.resolved.sequence_projection.spans.map((span) => {
              const clip = sequence?.clips.find((item) => item.id === `sequence:${span.part_public_id}`)
              const start = Number(clip?.startSample || 0) / SAMPLE_RATE
              const duration = Number(clip?.durationSamples || 0) / SAMPLE_RATE
              if (span.silence) return <button key={span.part_public_id} className={cn("sound-sequence-silence", selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration)} onClick={() => session.select({ kind: "part", id: span.part_id })} aria-label={`Silence ${duration.toFixed(1)} seconds`}><Clock3 /></button>
              return <button key={span.part_public_id} className={cn("sound-sequence-clip", `is-${roleColor(span.role)}`, selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration, 18)} onClick={() => session.select({ kind: "part", id: span.part_id })}><CanvasWaveform url={span.filename ? audioUrl(span.filename) : undefined} /><span><em>{String(Number(span.position ?? 0) + 1).padStart(2, "0")}</em><b>{span.role || span.voice_name || span.title || "Speech"}</b></span></button>
            })}
          </div>
          {tracks.map((track) => {
            const engineTrack = trackById.get(track.id)
            return <div className={cn("sound-scene-lane is-music", track.muted && "is-muted")} key={track.id}>
              {track.clips.map((clip) => {
                const current = engineTrack?.clips.find((item) => item.id === clip.id)
                if (!current || clip.orphan) return null
                const start = current.startSample / SAMPLE_RATE
                const duration = current.durationSamples / SAMPLE_RATE
                const selected = selection?.kind === "clip" && selection.clipId === clip.id
                const live = selected ? session.currentClip(track.id, clip.id) || clip : clip
                const fadeIn = Math.min(duration, live.fade_in_ms / 1000)
                const fadeOut = Math.min(duration, live.fade_out_ms / 1000)
                const gainHeight = Math.max(8, Math.min(82, 50 - (20 * Math.log10(Math.max(.001, live.gain))) * 1.25))
                return <div key={clip.id} role="button" tabIndex={0} className={cn("sound-music-clip", selected && "is-selected")} style={styleFor(start, duration, 24)} onPointerDown={(event) => gesture(event, track.id, clip.id, "move")} onClick={() => session.select({ kind: "clip", trackId: track.id, clipId: clip.id })}>
                  <CanvasWaveform url={clip.filename ? audioUrl(clip.filename) : undefined} />
                  <span className="sound-music-label"><Music2 /><span><b>{clip.asset_name || track.name}</b><small>{decibels(live.gain)}</small></span></span>
                  {selected && <>
                    <button className="sound-trim-handle is-start" aria-label="Trim start" onPointerDown={(event) => gesture(event, track.id, clip.id, "left")} />
                    <button className="sound-trim-handle is-end" aria-label="Trim end" onPointerDown={(event) => gesture(event, track.id, clip.id, "right")} />
                    <div className="sound-gain-line" style={{ top: gainHeight }} onPointerDown={(event) => gesture(event, track.id, clip.id, "gain")}><i /></div>
                    <svg className="sound-fade-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M 0 100 L ${fadeIn / duration * 100} 0 L ${100 - fadeOut / duration * 100} 0 L 100 100`} /></svg>
                    <button className="sound-fade-handle is-in" style={{ left: `${fadeIn / duration * 100}%` }} aria-label="Fade in" onPointerDown={(event) => gesture(event, track.id, clip.id, "fade-in")} />
                    <button className="sound-fade-handle is-out" style={{ left: `${(1 - fadeOut / duration) * 100}%` }} aria-label="Fade out" onPointerDown={(event) => gesture(event, track.id, clip.id, "fade-out")} />
                  </>}
                </div>
              })}
              {!track.clips.length && <button className="sound-empty-lane" onClick={() => onAddMusic({ mode: "add-clip", trackId: track.id })}><Plus /> Add Music clip</button>}
            </div>
          })}
        </div>
      </div>
    </div>
    <footer className="sound-scene-status"><span>{tracks.length} sound track{tracks.length === 1 ? "" : "s"}</span><span>{formatDuration(total)}</span>{saving && <b>Saving…</b>}{error && <b className="is-error" role="alert">{error}</b>}<span className="sound-follow"><Button variant="ghost" size="icon-sm" aria-label="Previous view" onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft -= scrollRef.current.clientWidth * .6 }}><ChevronLeft /></Button><button aria-pressed={followPlayhead} onClick={() => setFollowPlayhead((value) => !value)}>Follow playhead</button><Button variant="ghost" size="icon-sm" aria-label="Next view" onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft += scrollRef.current.clientWidth * .6 }}><ChevronRight /></Button></span></footer>
  </section>
}
