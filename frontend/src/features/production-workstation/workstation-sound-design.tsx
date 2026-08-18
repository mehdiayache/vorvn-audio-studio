import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { ChevronLeft, ChevronRight, Clock3, Music2, Pause, Play, Plus, Redo2, Undo2, Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAudioPeaks } from "@/components/audio-waveform"
import { audioUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { WorkstationPaneHeader } from "./workstation-pane-header"
import { SoundSceneSession, useSoundSceneSession } from "./sound-scene-session"

const PEAK_TIERS = [128, 256, 512, 1024, 2048, 4096] as const

function timeMarks(total: number) {
  const step = total > 600 ? 60 : total > 240 ? 30 : total > 90 ? 15 : 10
  return Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step)
}

function roleColor(role?: string | null) {
  const palette = ["violet", "blue", "teal", "amber", "rose"]
  const value = String(role || "voice")
  const hash = Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function tierForWidth(width: number) {
  return PEAK_TIERS.find((tier) => tier >= width) || PEAK_TIERS.at(-1)!
}

function CanvasWaveform({ url, className }: { url?: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tier, setTier] = useState<number>(128)
  const peaks = useAudioPeaks(url, tier)

  useEffect(() => {
    const node = canvas.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.ceil(entry?.contentRect.width || 1))
      setTier((current) => {
        const next = tierForWidth(width)
        return next === current ? current : next
      })
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
      const bar = Math.max(1, node.width / peaks.length)
      peaks.forEach((peak, index) => {
        const height = Math.max(2 * ratio, peak * node.height * .82)
        context.globalAlpha = .68
        context.fillRect(index * bar, (node.height - height) / 2, Math.max(1, bar * .56), height)
      })
    }
    draw()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(draw)
    observer.observe(node)
    return () => observer.disconnect()
  }, [peaks])
  return <canvas ref={canvas} className={className} aria-hidden="true" />
}

function TrackLabels({ session, onAddMusic }: { session: SoundSceneSession; onAddMusic: () => void }) {
  const { scene, selection, saving } = useSoundSceneSession(session)
  const music = scene.resolved.tracks.find((track) => track.kind === "music")
  const musicClip = music?.clips[0]
  return <div className="ws-track-list">
    <button className={selection?.kind === "part" ? "is-active" : ""} onClick={() => {
      const first = scene.resolved.sequence_projection.spans[0]
      session.select(first ? { kind: "part", id: first.part_id } : null)
    }}><span className="ws-track-icon is-voice"><Volume2 /></span><span><b>Sequence</b><small>{scene.resolved.sequence_projection.spans.length} recorded Parts</small></span></button>
    <button className={selection?.kind === "clip" ? "is-active" : ""} onClick={() => music && musicClip ? session.select({ kind: "clip", trackId: music.id, clipId: musicClip.id }) : onAddMusic()}><span className="ws-track-icon is-music"><Music2 /></span><span><b>Music</b><small>{musicClip?.asset_name || "No music"}</small></span></button>
    {music && <button disabled={saving} className="ws-track-mute" aria-label={music.muted ? "Unmute Music" : "Mute Music"} onClick={() => void session.commitTrackMute(music.id, !music.muted)}>{music.muted ? <VolumeX /> : <Volume2 />}</button>}
    {!musicClip && <Button variant="outline" onClick={onAddMusic}><Plus /> Choose music</Button>}
  </div>
}

export function SoundDesignOutline({ session, onAddMusic, onCollapse }: {
  session: SoundSceneSession
  onAddMusic: () => void
  onCollapse: () => void
}) {
  return <div className="ws-sound-outline">
    <WorkstationPaneHeader title="Tracks" meta="Sequence + Music" onCollapse={onCollapse} />
    <TrackLabels session={session} onAddMusic={onAddMusic} />
  </div>
}

export function WorkstationSoundDesign({ session, draftCount, onAddMusic }: {
  session: SoundSceneSession
  draftCount: number
  onAddMusic: () => void
}) {
  const { scene, engine: state, selection, playing, playhead, saving, error } = useSoundSceneSession(session)
  const total = Math.max(scene.resolved.sequence_projection.duration_ms / 1000, 1)
  const width = Math.max(920, Math.ceil(total * 48_000 / state.samplesPerPixel))
  const pixelsPerSecond = width / total
  const marks = timeMarks(total)
  const trackById = new Map(state.tracks.map((track) => [track.id, track]))
  const sequence = trackById.get("sequence-projection")
  const styleFor = (start: number, duration: number) => ({ left: `${start * pixelsPerSecond}px`, width: `${Math.max(duration * pixelsPerSecond, 18)}px` } as CSSProperties)

  function gesture(event: ReactPointerEvent, trackId: string, clipId: string, mode: "move" | "left" | "right") {
    if (event.button !== 0 || saving) return
    event.preventDefault()
    event.stopPropagation()
    session.select({ kind: "clip", trackId, clipId })
    session.beginGesture()
    let previous = event.clientX
    let finished = false
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", keydown)
    }
    const move = (next: PointerEvent) => {
      const delta = next.clientX - previous
      previous = next.clientX
      const deltaSamples = delta * 48_000 / pixelsPerSecond
      if (mode === "move") session.moveClip(trackId, clipId, deltaSamples)
      else session.trimClip(trackId, clipId, mode, deltaSamples)
    }
    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      void session.commitGesture()
    }
    const cancel = () => {
      if (finished) return
      finished = true
      cleanup()
      session.cancelGesture()
    }
    const keydown = (next: KeyboardEvent) => { if (next.key === "Escape") cancel() }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", cancel, { once: true })
    window.addEventListener("blur", cancel, { once: true })
    window.addEventListener("keydown", keydown)
  }

  function seek(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    session.seek((event.clientX - rect.left) / pixelsPerSecond)
  }

  return <div className="ws-sound-canvas">
    <header className="ws-canvas-heading ws-sound-heading">
      <div className="ws-heading-copy"><h2>Sound Design</h2><p>Shape the Music against the canonical Sequence.</p></div>
      <div className="ws-timeline-tools">
        <Button variant="ghost" size="icon-sm" onClick={() => void session.undo()} disabled={!scene.can_undo || saving} aria-label="Undo Sound Scene"><Undo2 /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void session.redo()} disabled={!scene.can_redo || saving} aria-label="Redo Sound Scene"><Redo2 /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => session.zoomOut()} disabled={!state.canZoomOut} aria-label="Zoom out"><ChevronLeft /></Button>
        <span>{Math.round(pixelsPerSecond)} px/s</span>
        <Button variant="ghost" size="icon-sm" onClick={() => session.zoomIn()} disabled={!state.canZoomIn} aria-label="Zoom in"><ChevronRight /></Button>
        <Button onClick={() => void session.togglePlayback()} disabled={!scene.sequence_stem.url}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play scene"}</Button>
      </div>
    </header>
    {draftCount > 0 && <div className="ws-sound-draft-notice" role="status">{draftCount} unrecorded Draft{draftCount === 1 ? " is" : "s are"} absent from Sound Design and preview.</div>}
    <div className="ws-timeline-scroll">
      <div className="ws-timeline is-engine-backed" style={{ width }} onPointerDown={seek}>
        <div className="ws-ruler">{marks.map((mark) => <span key={mark} style={{ left: mark * pixelsPerSecond }}><i />{formatDuration(mark)}</span>)}</div>
        <div className="ws-playhead" style={{ left: playhead * pixelsPerSecond }}><i /></div>
        <div className="ws-lane is-voice" aria-label="Sequence track">
          {scene.resolved.sequence_projection.spans.map((span) => {
            const enginePart = sequence?.clips.find((clip) => clip.id === `sequence:${span.part_public_id}`)
            const start = (enginePart?.startSample || 0) / 48_000
            const duration = (enginePart?.durationSamples || 0) / 48_000
            return <button key={span.part_public_id} className={cn("ws-timeline-clip", `is-${roleColor(span.role)}`, selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration)} onPointerDown={(event) => event.stopPropagation()} onClick={() => session.select({ kind: "part", id: span.part_id })}>
              {!span.silence && <CanvasWaveform url={span.filename ? audioUrl(span.filename) : undefined} className="ws-canvas-waveform" />}
              <span className="ws-timeline-clip-label">{span.silence ? <Clock3 /> : <em>{String(Number(span.position ?? 0) + 1).padStart(2, "0")}</em>}<b>{span.silence ? "Silence" : span.role || span.voice_name || span.title || "Speech"}</b></span>
            </button>
          })}
        </div>
        {scene.resolved.tracks.filter((track) => track.kind === "music").map((track) => {
          const engineTrack = trackById.get(track.id)
          return <div className={cn("ws-lane is-music", track.muted && "is-muted")} aria-label="Music track" key={track.id}>
            {track.clips.map((clip) => {
              const engineMusic = engineTrack?.clips.find((item) => item.id === clip.id)
              if (!engineMusic || clip.orphan) return null
              const start = engineMusic.startSample / 48_000
              const duration = engineMusic.durationSamples / 48_000
              return <div key={clip.id} role="button" tabIndex={0} className={cn("ws-music-clip", selection?.kind === "clip" && selection.clipId === clip.id && "is-selected")} style={styleFor(start, duration)} onPointerDown={(event) => gesture(event, track.id, clip.id, "move")}>
                <button className="ws-trim-handle is-start" aria-label="Trim Music start" onPointerDown={(event) => gesture(event, track.id, clip.id, "left")} />
                <CanvasWaveform url={clip.filename ? audioUrl(clip.filename) : undefined} className="ws-canvas-waveform" />
                <span className="ws-music-label"><Music2 /><span><b>{clip.asset_name || "Music"}</b><small>{Math.round(engineMusic.gain * 100)}% clip · {Math.round(track.volume * 100)}% track</small></span></span>
                <button className="ws-trim-handle is-end" aria-label="Trim Music end" onPointerDown={(event) => gesture(event, track.id, clip.id, "right")} />
              </div>
            })}
            {!track.clips.length && <button className="ws-empty-lane-action" onPointerDown={(event) => event.stopPropagation()} onClick={onAddMusic}><Plus /> Choose music</button>}
          </div>
        })}
      </div>
    </div>
    <footer className="ws-sound-status"><span><i className="is-voice" /> Sequence</span><span><i className="is-music" /> Music</span><b>{formatDuration(total)} Production</b>{saving && <em>Saving edit…</em>}{error && <em className="is-error" role="alert">{error}</em>}</footer>
  </div>
}
