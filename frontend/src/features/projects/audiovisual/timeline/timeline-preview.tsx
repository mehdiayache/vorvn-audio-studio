import { Film, Image as ImageIcon, MonitorPlay, Pause, Play, Waves } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { AudioWaveform } from "@/components/audio-waveform"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { visualFileName, visualFilePlaybackUrl, visualFilePosterUrl, visualFileUrl } from "@/features/creator/library/visual-file-presentation"
import { SoundMediaIcon, audioFileFamily, type SoundMediaKind } from "@/features/sound-scene/audio-presentation"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"

import { TimelinePreview } from "./timeline-viewer"
import type { WorkstationSelection } from "./workstation-selection"
import { WorkstationPaneHeader } from "./workstation-pane-header"

export type PreviewTarget =
  | { kind: "timeline" }
  | { kind: "source"; fileId: number }

type AudioPreviewDescriptor = {
  key: string
  name: string
  url: string
  mediaKind: SoundMediaKind
  durationMs: number
}

export function resolvePreviewTarget(target: PreviewTarget, files: WorkspaceFile[]) {
  if (target.kind === "source") {
    const file = files.find((candidate) => candidate.id === target.fileId)
    return file ? { kind: "source" as const, file } : { kind: "timeline" as const }
  }
  return { kind: "timeline" as const }
}

function PreviewModeLabel({ mode }: { mode: PreviewTarget["kind"] }) {
  return <span className="preview-mode-label">{mode}</span>
}

function SourcePreviewHeader({ icon, onReturnTimeline }: { icon: ReactNode; onReturnTimeline: () => void }) {
  return <WorkstationPaneHeader
    icon={icon}
    title="Preview"
    actions={<><PreviewModeLabel mode="source" /><OperatorIconButton label="Return to Timeline Preview" detail="Show the complete Project at the Timeline playhead." onClick={onReturnTimeline}><MonitorPlay /></OperatorIconButton></>}
  />
}

function PreviewTransport({ label, current, duration, playing, loading = false, disabled = false, onToggle, onSeek }: {
  label: string
  current: number
  duration: number
  playing: boolean
  loading?: boolean
  disabled?: boolean
  onToggle: () => void
  onSeek: (seconds: number) => void
}) {
  const safeDuration = Math.max(0, duration)
  const safeCurrent = Math.max(0, Math.min(safeDuration, current))
  return <div className="preview-local-transport" aria-label={`${label} transport`}>
    <OperatorIconButton label={playing ? `Pause ${label}` : `Play ${label}`} disabled={disabled} busy={loading} busyLabel={`Preparing ${label}`} onClick={onToggle}>{playing ? <Pause /> : <Play />}</OperatorIconButton>
    <span>{formatDuration(safeCurrent)}</span>
    <Slider value={[safeCurrent]} max={Math.max(safeDuration, 1)} step={.05} disabled={disabled} onValueChange={([value = 0]) => onSeek(value)} aria-label={`${label} playback position`} />
    <span>{formatDuration(safeDuration)}</span>
  </div>
}

function SourceTiming({ durationMs }: { durationMs: number }) {
  return <span><b>Source</b><i>{formatDuration(durationMs / 1_000)}</i></span>
}

function sourceAudioDescriptor(file: WorkspaceFile): AudioPreviewDescriptor | null {
  if (file.media_type !== "audio" || !file.filename) return null
  return {
    key: `source:${file.id}`,
    name: String(file.name || file.title || file.filename || "Untitled audio"),
    url: audioUrl(file.filename),
    mediaKind: audioFileFamily(file),
    durationMs: Math.max(0, Number(file.duration_ms || 0)),
  }
}

function AudioSourcePreview({ descriptor, soundSession, onReturnTimeline }: { descriptor: AudioPreviewDescriptor; soundSession: SoundSceneSession; onReturnTimeline: () => void }) {
  const player = useGlobalPlayer()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(descriptor.durationMs / 1_000)

  useEffect(() => () => { audioRef.current?.pause() }, [])
  useEffect(() => {
    audioRef.current?.pause()
    setPlaying(false)
    setLoading(false)
    setCurrent(0)
    setDuration(descriptor.durationMs / 1_000)
  }, [descriptor.key, descriptor.durationMs])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) { audio.pause(); return }
    soundSession.pause()
    player.close()
    if (duration > 0 && current >= duration - .04) audio.currentTime = 0
    setLoading(true)
    try { await audio.play() } catch { setLoading(false); setPlaying(false) }
  }
  const seek = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const next = Math.max(0, Math.min(duration, seconds))
    try { audio.currentTime = next } catch { /* media may not be seekable yet */ }
    setCurrent(next)
  }
  const leave = () => { audioRef.current?.pause(); onReturnTimeline() }
  return <section className="media-preview audio-preview" aria-label="Source Preview">
    <SourcePreviewHeader icon={<Waves />} onReturnTimeline={leave} />
    <div className="audio-preview-body">
      <div className="preview-identity">
        <span className={cn("preview-identity-icon", `is-${descriptor.mediaKind}`)}><SoundMediaIcon kind={descriptor.mediaKind} /></span>
        <div><small>AUDIO SOURCE</small><h3 title={descriptor.name}>{descriptor.name}</h3></div>
      </div>
      <div className="audio-preview-waveform"><AudioWaveform url={descriptor.url || undefined} bars={96} /></div>
      <div className="preview-timing"><SourceTiming durationMs={descriptor.durationMs} /></div>
      <audio ref={audioRef} src={descriptor.url} preload="metadata" onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration)} onWaiting={() => setLoading(true)} onPlaying={() => { setLoading(false); setPlaying(true) }} onPause={() => { setLoading(false); setPlaying(false) }} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)} />
    </div>
    <PreviewTransport label="Source Preview" current={current} duration={duration} playing={playing} loading={loading} disabled={!descriptor.url} onToggle={() => void toggle()} onSeek={seek} />
  </section>
}

function VisualSourcePreview({ file, soundSession, onReturnTimeline }: {
  file: WorkspaceFile
  soundSession: SoundSceneSession
  onReturnTimeline: () => void
}) {
  const player = useGlobalPlayer()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [duration, setDuration] = useState(Math.max(0, Number(file.duration_ms || 0)) / 1_000)
  const [current, setCurrent] = useState(0)
  const canvas = { width: Number(file.width || 16), height: Number(file.height || 9) }
  const frameStyle = { "--preview-aspect": canvas.width / canvas.height, aspectRatio: `${canvas.width} / ${canvas.height}` } as CSSProperties
  const name = visualFileName(file)

  useEffect(() => () => { videoRef.current?.pause() }, [])
  useEffect(() => {
    videoRef.current?.pause()
    setPlaying(false)
    setLoading(false)
    setCurrent(0)
  }, [file.id])

  const toggle = async () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) { video.pause(); return }
    soundSession.pause()
    player.close()
    if (duration > 0 && current >= duration - .04) video.currentTime = 0
    setLoading(true)
    try { await video.play() } catch { setLoading(false); setPlaying(false) }
  }
  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    const next = Math.max(0, Math.min(duration, seconds))
    try { video.currentTime = next } catch { /* media may not be seekable yet */ }
    setCurrent(next)
  }
  const leave = () => { videoRef.current?.pause(); onReturnTimeline() }

  return <section className="media-preview visual-preview" aria-label="Source Preview">
    <SourcePreviewHeader icon={file.media_type === "video" ? <Film /> : <ImageIcon />} onReturnTimeline={leave} />
    <div className="visual-preview-stage">
      <div className="visual-preview-frame" data-orientation={canvas.width < canvas.height ? "portrait" : "landscape"} style={frameStyle}>
        {file.media_type === "video"
          ? <video ref={videoRef} src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} style={{ objectFit: "contain" }} playsInline preload="metadata" onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration)} onWaiting={() => setLoading(true)} onPlaying={() => { setLoading(false); setPlaying(true) }} onPause={() => { setLoading(false); setPlaying(false) }} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime || 0)} />
          : <img src={visualFileUrl(file)} alt={name} style={{ objectFit: "contain" }} />}
      </div>
    </div>
    <div className="preview-identity-strip">
      <div><small>{String(file.media_type).toUpperCase()} SOURCE</small><b title={name}>{name}</b></div>
      <div className="preview-timing"><SourceTiming durationMs={Number(file.duration_ms || 0)} /></div>
    </div>
    {file.media_type === "video" && <PreviewTransport label="Source Preview" current={current} duration={duration} playing={playing} loading={loading} disabled={!file.filename} onToggle={() => void toggle()} onSeek={seek} />}
  </section>
}

export function PreviewPane({ target, selection, files, document, hasVisualPlacements, playheadMs, playback, visualSession, soundSession, visualSaving, timelineTransport, onReturnTimeline }: {
  target: PreviewTarget
  selection: WorkstationSelection
  files: WorkspaceFile[]
  document: VisualSceneDocument
  hasVisualPlacements: boolean
  playheadMs: number
  playback: "idle" | "preparing" | "playing"
  visualSession?: VisualSceneSession
  soundSession: SoundSceneSession
  visualSaving: boolean
  timelineTransport: ReactNode
  onReturnTimeline: () => void
}) {
  const resolved = resolvePreviewTarget(target, files)
  if (resolved.kind === "source") {
    const descriptor = sourceAudioDescriptor(resolved.file)
    if (descriptor) return <AudioSourcePreview descriptor={descriptor} soundSession={soundSession} onReturnTimeline={onReturnTimeline} />
    if (resolved.file.media_type === "image" || resolved.file.media_type === "video") return <VisualSourcePreview file={resolved.file} soundSession={soundSession} onReturnTimeline={onReturnTimeline} />
  }
  const visualSelection = selection?.kind === "visual-placement" ? selection.primary.ref : null
  if (visualSession && hasVisualPlacements) return <TimelinePreview document={document} files={files} playheadMs={playheadMs} playback={playback} selection={visualSelection} session={visualSession} saving={visualSaving} transport={timelineTransport} />
  return <section className="timeline-preview-empty" aria-label="Timeline Preview">
    <WorkstationPaneHeader icon={<MonitorPlay />} title="Preview" actions={<PreviewModeLabel mode="timeline" />} />
    <div><Waves /><b>Timeline Preview</b><small>Add visual media to see the Project composition. Audio remains available in Timeline playback.</small></div>
    <footer className="timeline-preview-footer" aria-label="Timeline Preview transport">{timelineTransport}</footer>
  </section>
}
