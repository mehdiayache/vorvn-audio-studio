import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { ChevronLeft, ChevronRight, Clock3, Music2, Pause, Play, Plus, Redo2, Undo2, Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAudioPeaks } from "@/components/audio-waveform"
import { audioUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import type { SoundScene, SoundSceneDocument } from "@/types/domain"
import { WorkstationPaneHeader } from "./workstation-pane-header"
import { SoundSceneEngine, type SoundSceneEngineState } from "./sound-scene-engine"
import { SoundScenePlayout } from "./sound-scene-playout"

type SoundSelection =
  | { kind: "part"; id: number }
  | { kind: "clip"; trackId: string; clipId: string }
  | null

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

function CanvasWaveform({ url, className }: { url?: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const peaks = useAudioPeaks(url, 192)
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

function TrackLabels({ scene, selection, onSelection, onAddMusic, onMute }: {
  scene: SoundScene
  selection: SoundSelection
  onSelection: (selection: SoundSelection) => void
  onAddMusic: () => void
  onMute: (trackId: string, muted: boolean) => void
}) {
  const music = scene.resolved.tracks.find((track) => track.kind === "music")
  const musicClip = music?.clips[0]
  return <div className="ws-track-list">
    <button className={selection?.kind === "part" ? "is-active" : ""} onClick={() => {
      const first = scene.resolved.voice_projection.spans[0]
      onSelection(first ? { kind: "part", id: first.part_id } : null)
    }}><span className="ws-track-icon is-voice"><Volume2 /></span><span><b>Voice</b><small>{scene.resolved.voice_projection.spans.length} Sequence clips</small></span></button>
    <button className={selection?.kind === "clip" ? "is-active" : ""} onClick={() => music && musicClip ? onSelection({ kind: "clip", trackId: music.id, clipId: musicClip.id }) : onAddMusic()}><span className="ws-track-icon is-music"><Music2 /></span><span><b>Music</b><small>{musicClip?.asset_name || "No music"}</small></span></button>
    {music && <button className="ws-track-mute" aria-label={music.muted ? "Unmute Music" : "Mute Music"} onClick={() => onMute(music.id, !music.muted)}>{music.muted ? <VolumeX /> : <Volume2 />}</button>}
    {!musicClip && <Button variant="outline" onClick={onAddMusic}><Plus /> Choose music</Button>}
  </div>
}

export function SoundDesignOutline({ scene, selection, onSelection, onAddMusic, onCollapse, onMute }: {
  scene: SoundScene
  selection: SoundSelection
  onSelection: (selection: SoundSelection) => void
  onAddMusic: () => void
  onCollapse: () => void
  onMute: (trackId: string, muted: boolean) => void
}) {
  return <div className="ws-sound-outline">
    <WorkstationPaneHeader title="Tracks" meta="Voice projection + Music" onCollapse={onCollapse} />
    <TrackLabels scene={scene} selection={selection} onSelection={onSelection} onAddMusic={onAddMusic} onMute={onMute} />
  </div>
}

export function WorkstationSoundDesign({ scene, selection, onSelection, onAddMusic, onCommit, onUndo, onRedo }: {
  scene: SoundScene
  selection: SoundSelection
  onSelection: (selection: SoundSelection) => void
  onAddMusic: () => void
  onCommit: (document: SoundSceneDocument) => Promise<void>
  onUndo: () => Promise<void>
  onRedo: () => Promise<void>
}) {
  const editor = useMemo(() => new SoundSceneEngine(scene), [scene.revision, scene.resolved.signature])
  const playout = useMemo(() => new SoundScenePlayout(scene), [scene.production_id])
  const [state, setState] = useState<SoundSceneEngineState>(() => editor.state())
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [saving, setSaving] = useState(false)
  const [playbackError, setPlaybackError] = useState("")

  useEffect(() => {
    setState(editor.state())
    return editor.onChange(setState)
  }, [editor])
  useEffect(() => () => editor.dispose(), [editor])
  useEffect(() => { playout.replace(scene) }, [playout, scene])
  useEffect(() => () => playout.dispose(), [playout])
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const update = () => {
      setPlayhead(playout.currentTime())
      if (!playout.isPlaying()) { setPlaying(false); return }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [playing, playout])

  const total = Math.max(scene.resolved.voice_projection.duration_ms / 1000, 1)
  const width = Math.max(920, Math.ceil(total * 48_000 / state.samplesPerPixel))
  const pixelsPerSecond = width / total
  const marks = timeMarks(total)
  const trackById = new Map(state.tracks.map((track) => [track.id, track]))
  const voice = trackById.get("voice-projection")
  const styleFor = (start: number, duration: number) => ({ left: `${start * pixelsPerSecond}px`, width: `${Math.max(duration * pixelsPerSecond, 18)}px` } as CSSProperties)

  async function commit(document = editor.document()) {
    setSaving(true)
    try { await onCommit(document) } finally { setSaving(false) }
  }

  function gesture(event: ReactPointerEvent, trackId: string, clipId: string, mode: "move" | "left" | "right") {
    if (event.button !== 0 || saving) return
    event.preventDefault()
    event.stopPropagation()
    onSelection({ kind: "clip", trackId, clipId })
    editor.beginGesture()
    let previous = event.clientX
    const move = (next: PointerEvent) => {
      const delta = next.clientX - previous
      previous = next.clientX
      const deltaSamples = delta * 48_000 / pixelsPerSecond
      if (mode === "move") editor.moveClip(trackId, clipId, deltaSamples)
      else editor.trimClip(trackId, clipId, mode, deltaSamples)
    }
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      editor.commitGesture()
      void commit()
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
  }

  async function togglePlayback() {
    if (playing) { playout.pause(); setPlaying(false); return }
    setPlaybackError("")
    try { await playout.play(playhead); setPlaying(true) }
    catch (reason) {
      setPlaying(false)
      setPlaybackError(reason instanceof Error ? reason.message : "The Sound Scene could not be played.")
    }
  }

  function seek(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = Math.max(0, Math.min(total, (event.clientX - rect.left) / pixelsPerSecond))
    setPlayhead(next)
    playout.seek(next)
    editor.seek(next)
  }

  return <div className="ws-sound-canvas">
    <header className="ws-canvas-heading ws-sound-heading">
      <div className="ws-heading-copy"><h2>Sound scene</h2><p>One projected Voice Stem, one editable Music track.</p></div>
      <div className="ws-timeline-tools">
        <Button variant="ghost" size="icon-sm" onClick={() => void onUndo()} disabled={!scene.can_undo || saving} aria-label="Undo Sound Scene"><Undo2 /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void onRedo()} disabled={!scene.can_redo || saving} aria-label="Redo Sound Scene"><Redo2 /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => editor.zoomOut()} disabled={!state.canZoomOut} aria-label="Zoom out"><ChevronLeft /></Button>
        <span>{Math.round(pixelsPerSecond)} px/s</span>
        <Button variant="ghost" size="icon-sm" onClick={() => editor.zoomIn()} disabled={!state.canZoomIn} aria-label="Zoom in"><ChevronRight /></Button>
        <Button onClick={() => void togglePlayback()} disabled={!scene.voice_stem.url}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play scene"}</Button>
      </div>
    </header>
    <div className="ws-timeline-scroll">
      <div className="ws-timeline is-engine-backed" style={{ width }} onPointerDown={seek}>
        <div className="ws-ruler">{marks.map((mark) => <span key={mark} style={{ left: mark * pixelsPerSecond }}><i />{formatDuration(mark)}</span>)}</div>
        <div className="ws-playhead" style={{ left: playhead * pixelsPerSecond }}><i /></div>
        <div className="ws-lane is-voice" aria-label="Voice Projection track">
          {scene.resolved.voice_projection.spans.map((span) => {
            const enginePart = voice?.clips.find((clip) => clip.id === `voice:${span.part_id}`)
            const start = (enginePart?.startSample || 0) / 48_000
            const duration = (enginePart?.durationSamples || 0) / 48_000
            return <button key={span.part_id} className={cn("ws-timeline-clip", `is-${roleColor(span.role)}`, selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration)} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelection({ kind: "part", id: span.part_id })}>
              {!span.silence && <CanvasWaveform url={span.filename ? audioUrl(span.filename) : undefined} className="ws-canvas-waveform" />}
              <span className="ws-timeline-clip-label">{span.silence ? <Clock3 /> : <em>{String(Number(span.position ?? 0) + 1).padStart(2, "0")}</em>}<b>{span.silence ? "Silence" : span.role || span.voice_name || span.title || "Voice"}</b></span>
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
                <span className="ws-music-label"><Music2 /><span><b>{clip.asset_name || "Music"}</b><small>{Math.round(clip.gain * 100)}% · {clip.loop ? "Loop" : "Once"}</small></span></span>
                <button className="ws-trim-handle is-end" aria-label="Trim Music end" onPointerDown={(event) => gesture(event, track.id, clip.id, "right")} />
              </div>
            })}
            {!track.clips.length && <button className="ws-empty-lane-action" onPointerDown={(event) => event.stopPropagation()} onClick={onAddMusic}><Plus /> Choose music</button>}
          </div>
        })}
      </div>
    </div>
    <footer className="ws-sound-status"><span><i className="is-voice" /> Voice Projection</span><span><i className="is-music" /> Music</span><b>{formatDuration(total)} Production</b>{saving && <em>Saving edit…</em>}{playbackError && <em className="is-error" role="alert">{playbackError}</em>}</footer>
  </div>
}

export type { SoundSelection }
