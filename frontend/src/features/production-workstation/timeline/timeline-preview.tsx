import { Film, Image as ImageIcon, MonitorPlay, Pause, Play, Waves } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { AudioWaveform } from "@/components/audio-waveform"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { visualAssetName, visualAssetPlaybackUrl, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import { SoundMediaIcon, audioAssetFamily, soundClipMediaKind, type SoundMediaKind } from "@/features/sound-scene/audio-presentation"
import { soundClipSourceUrl } from "@/features/sound-scene/engine/sound-clip-source"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { visualLayerStyle } from "@/features/visual-scene/timeline/visual-scene-monitor"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PlayerSource, VentureAsset, VisualSceneClip, VisualSceneDocument } from "@/types/domain"

import { TimelinePreview } from "./timeline-viewer"
import type { WorkstationSelection } from "./workstation-selection"
import { WorkstationPaneHeader } from "./workstation-pane-header"

export type PreviewTarget =
  | { kind: "timeline" }
  | { kind: "clip" }
  | { kind: "source"; assetId: number }

type PreviewMode = PreviewTarget["kind"]

type AudioPreviewDescriptor = {
  key: string
  mode: Exclude<PreviewMode, "timeline">
  name: string
  url: string
  mediaKind: SoundMediaKind
  durationMs: number
  sourceDurationMs: number
  sourceStartMs: number
  timelineStartMs?: number
}

export function resolvePreviewTarget(target: PreviewTarget, selection: WorkstationSelection, assets: VentureAsset[]) {
  if (target.kind === "source") {
    const asset = assets.find((candidate) => candidate.id === target.assetId)
    return asset ? { kind: "source" as const, asset } : { kind: "timeline" as const }
  }
  if (target.kind === "clip" && selection) return { kind: "clip" as const, selection }
  return { kind: "timeline" as const }
}

function PreviewModeLabel({ mode }: { mode: PreviewMode }) {
  return <span className="preview-mode-label">{mode}</span>
}

function PreviewHeader({ mode, icon, onReturnTimeline }: { mode: Exclude<PreviewMode, "timeline">; icon: ReactNode; onReturnTimeline: () => void }) {
  return <WorkstationPaneHeader
    icon={icon}
    title="Preview"
    actions={<><PreviewModeLabel mode={mode} /><OperatorIconButton label="Return to Timeline Preview" detail="Show the complete Production at the Timeline playhead." onClick={onReturnTimeline}><MonitorPlay /></OperatorIconButton></>}
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

function previewTiming(mode: Exclude<PreviewMode, "timeline">, durationMs: number, sourceStartMs: number, sourceDurationMs: number, timelineStartMs?: number) {
  if (mode === "source") return <span><b>Source</b><i>{formatDuration(durationMs / 1_000)}</i></span>
  return <>
    {typeof timelineStartMs === "number" && <span><b>Timeline</b><i>{formatDuration(timelineStartMs / 1_000)}–{formatDuration((timelineStartMs + durationMs) / 1_000)}</i></span>}
    <span><b>Source</b><i>{formatDuration(sourceStartMs / 1_000)}–{formatDuration((sourceStartMs + durationMs) / 1_000)} / {formatDuration(sourceDurationMs / 1_000)}</i></span>
  </>
}

function sourceAudioDescriptor(asset: VentureAsset): AudioPreviewDescriptor | null {
  if (asset.media_type !== "audio" || !asset.filename) return null
  const durationMs = Math.max(0, Number(asset.duration_ms || 0))
  return {
    key: `source:${asset.id}`,
    mode: "source",
    name: String(asset.name || asset.title || asset.filename || "Untitled audio"),
    url: audioUrl(asset.filename),
    mediaKind: audioAssetFamily(asset),
    durationMs,
    sourceDurationMs: durationMs,
    sourceStartMs: 0,
  }
}

function clipAudioDescriptor(selection: WorkstationSelection): AudioPreviewDescriptor | null {
  if (selection?.kind === "audio-placement") {
    const { ref, clip } = selection.primary
    const durationMs = Math.max(0, Number(clip.resolved_duration_ms || clip.duration_ms || 0))
    const sourceStartMs = Math.max(0, Number(clip.source_offset_ms || 0))
    return {
      key: `clip:${ref.trackId}:${ref.clipId}`,
      mode: "clip",
      name: clip.asset_name || "Audio clip",
      url: soundClipSourceUrl(clip) || "",
      mediaKind: soundClipMediaKind(clip),
      durationMs,
      sourceDurationMs: Math.max(durationMs + sourceStartMs, Number(clip.source_duration_ms || 0)),
      sourceStartMs,
      timelineStartMs: Math.max(0, Number(clip.resolved_start_ms || 0)),
    }
  }
  if (selection?.kind === "script-part") {
    const span = selection.span
    return {
      key: `script:${span.part_public_id}`,
      mode: "clip",
      name: span.role || span.voice_name || span.title || "Script audio",
      url: span.filename ? audioUrl(span.filename) : "",
      mediaKind: "speech",
      durationMs: Math.max(0, Number(span.duration_ms || 0)),
      sourceDurationMs: Math.max(0, Number(span.duration_ms || 0)),
      sourceStartMs: 0,
      timelineStartMs: Math.max(0, Number(span.start_ms || 0)),
    }
  }
  return null
}

function AudioPreview({ descriptor, soundSession, onReturnTimeline }: { descriptor: AudioPreviewDescriptor; soundSession: SoundSceneSession; onReturnTimeline: () => void }) {
  const player = useGlobalPlayer()
  const source = useMemo<PlayerSource>(() => ({
    key: `timeline-preview:${descriptor.key}`,
    url: descriptor.url,
    title: descriptor.name,
    subtitle: descriptor.mode === "clip" ? "Timeline clip audition" : "Source audition",
    sourceLabel: descriptor.mode === "clip" ? "Clip Preview" : "Source Preview",
    kind: descriptor.mode === "clip" ? "clip" : "asset",
    startTime: descriptor.sourceStartMs / 1_000,
    endTime: descriptor.durationMs > 0 ? (descriptor.sourceStartMs + descriptor.durationMs) / 1_000 : undefined,
  }), [descriptor])
  const active = player.source?.key === source.key
  const playing = active && player.state === "playing"
  const loading = active && player.state === "loading"
  const current = active ? Math.max(0, player.currentTime - descriptor.sourceStartMs / 1_000) : 0
  const duration = descriptor.durationMs > 0 ? descriptor.durationMs / 1_000 : active ? Math.max(0, player.duration - descriptor.sourceStartMs / 1_000) : 0
  const leave = () => { if (active) player.close(); onReturnTimeline() }
  return <section className="media-preview audio-preview" aria-label={`${descriptor.mode === "clip" ? "Clip" : "Source"} Preview`}>
    <PreviewHeader mode={descriptor.mode} icon={<Waves />} onReturnTimeline={leave} />
    <div className="audio-preview-body">
      <div className="preview-identity">
        <span className={cn("preview-identity-icon", `is-${descriptor.mediaKind}`)}><SoundMediaIcon kind={descriptor.mediaKind} /></span>
        <div><small>{descriptor.mode === "clip" ? "AUDIO CLIP" : "AUDIO SOURCE"}</small><h3 title={descriptor.name}>{descriptor.name}</h3></div>
      </div>
      <div className="audio-preview-waveform"><AudioWaveform url={descriptor.url || undefined} bars={96} /></div>
      <div className="preview-timing">{previewTiming(descriptor.mode, descriptor.durationMs, descriptor.sourceStartMs, descriptor.sourceDurationMs, descriptor.timelineStartMs)}</div>
    </div>
    <PreviewTransport
      label={descriptor.mode === "clip" ? "Clip Preview" : "Source Preview"}
      current={current}
      duration={duration}
      playing={playing}
      loading={loading}
      disabled={!descriptor.url}
      onToggle={() => { soundSession.pause(); void player.toggleSource(source) }}
      onSeek={(seconds) => { if (!active) return; player.seek(descriptor.sourceStartMs / 1_000 + seconds) }}
    />
  </section>
}

function VisualPreview({ mode, asset, clip, document, soundSession, onReturnTimeline }: {
  mode: Exclude<PreviewMode, "timeline">
  asset: VentureAsset
  clip?: VisualSceneClip
  document: VisualSceneDocument
  soundSession: SoundSceneSession
  onReturnTimeline: () => void
}) {
  const player = useGlobalPlayer()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sourceDuration, setSourceDuration] = useState(Math.max(0, Number(asset.duration_ms || 0)) / 1_000)
  const [sourceTime, setSourceTime] = useState(Math.max(0, Number(clip?.source_offset_ms || 0)) / 1_000)
  const sourceStart = Math.max(0, Number(clip?.source_offset_ms || 0)) / 1_000
  const requestedDuration = clip ? Math.max(0, clip.duration_ms / 1_000) : Math.max(0, Number(asset.duration_ms || 0)) / 1_000
  const previewDuration = requestedDuration || sourceDuration
  const sourceEnd = sourceStart + previewDuration
  const current = Math.max(0, Math.min(previewDuration, sourceTime - sourceStart))
  const canvas = mode === "clip" ? document.canvas : { width: Number(asset.width || 16), height: Number(asset.height || 9) }
  const frameStyle = { "--preview-aspect": canvas.width / canvas.height, aspectRatio: `${canvas.width} / ${canvas.height}` } as CSSProperties
  const mediaStyle = clip ? visualLayerStyle(clip, document, 1) : { objectFit: "contain" as const }
  const name = visualAssetName(asset)

  useEffect(() => () => { videoRef.current?.pause() }, [])
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    setPlaying(false)
    setLoading(false)
    setSourceTime(sourceStart)
    if (video.readyState >= 1) {
      try { video.currentTime = sourceStart } catch { /* metadata will retry */ }
    }
  }, [asset.id, mode, sourceStart])

  const toggle = async () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) { video.pause(); return }
    soundSession.pause()
    player.pause()
    if (current >= previewDuration - .04) {
      try { video.currentTime = sourceStart } catch { /* media may not be seekable yet */ }
    }
    setLoading(true)
    try { await video.play() } catch { setLoading(false); setPlaying(false) }
  }
  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    const next = sourceStart + Math.max(0, Math.min(previewDuration, seconds))
    try { video.currentTime = next } catch { /* media may not be seekable yet */ }
    setSourceTime(next)
  }
  const leave = () => { videoRef.current?.pause(); onReturnTimeline() }

  return <section className="media-preview visual-preview" aria-label={`${mode === "clip" ? "Clip" : "Source"} Preview`}>
    <PreviewHeader mode={mode} icon={asset.media_type === "video" ? <Film /> : <ImageIcon />} onReturnTimeline={leave} />
    <div className="visual-preview-stage">
      <div className="visual-preview-frame" data-orientation={canvas.width < canvas.height ? "portrait" : "landscape"} style={frameStyle}>
        {asset.media_type === "video"
          ? <video ref={videoRef} src={visualAssetPlaybackUrl(asset)} poster={visualAssetPosterUrl(asset)} style={mediaStyle} playsInline preload="metadata" onLoadedMetadata={(event) => {
            const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : sourceDuration
            setSourceDuration(duration)
            try { event.currentTarget.currentTime = sourceStart } catch { /* source will remain at its first seekable frame */ }
          }} onWaiting={() => setLoading(true)} onPlaying={() => { setLoading(false); setPlaying(true) }} onPause={() => { setLoading(false); setPlaying(false) }} onTimeUpdate={(event) => {
            const next = event.currentTarget.currentTime || 0
            if (previewDuration > 0 && next >= sourceEnd - .025) {
              event.currentTarget.pause()
              try { event.currentTarget.currentTime = sourceEnd } catch { /* preserve the last reported frame */ }
              setSourceTime(sourceEnd)
              return
            }
            setSourceTime(next)
          }} />
          : <img src={visualAssetUrl(asset)} alt={name} style={mediaStyle} />}
      </div>
    </div>
    <div className="preview-identity-strip">
      <div><small>{mode === "clip" ? `${String(asset.media_type).toUpperCase()} CLIP` : `${String(asset.media_type).toUpperCase()} SOURCE`}</small><b title={name}>{name}</b></div>
      <div className="preview-timing">{previewTiming(mode, clip?.duration_ms || Number(asset.duration_ms || 0), clip?.source_offset_ms || 0, Math.max(Number(asset.duration_ms || 0), clip ? clip.source_offset_ms + clip.duration_ms : 0), clip?.start_ms)}</div>
    </div>
    {asset.media_type === "video" && <PreviewTransport label={mode === "clip" ? "Clip Preview" : "Source Preview"} current={current} duration={previewDuration} playing={playing} loading={loading} disabled={!asset.filename} onToggle={() => void toggle()} onSeek={seek} />}
  </section>
}

export function PreviewPane({ target, selection, assets, document, hasVisualPlacements, playheadMs, playback, visualSession, soundSession, visualSaving, onReturnTimeline }: {
  target: PreviewTarget
  selection: WorkstationSelection
  assets: VentureAsset[]
  document: VisualSceneDocument
  hasVisualPlacements: boolean
  playheadMs: number
  playback: "idle" | "preparing" | "playing"
  visualSession?: VisualSceneSession
  soundSession: SoundSceneSession
  visualSaving: boolean
  onReturnTimeline: () => void
}) {
  const resolved = resolvePreviewTarget(target, selection, assets)
  if (resolved.kind === "source") {
    const descriptor = sourceAudioDescriptor(resolved.asset)
    if (descriptor) return <AudioPreview descriptor={descriptor} soundSession={soundSession} onReturnTimeline={onReturnTimeline} />
    if (resolved.asset.media_type === "image" || resolved.asset.media_type === "video") return <VisualPreview mode="source" asset={resolved.asset} document={document} soundSession={soundSession} onReturnTimeline={onReturnTimeline} />
  }
  if (resolved.kind === "clip") {
    const descriptor = clipAudioDescriptor(resolved.selection)
    if (descriptor) return <AudioPreview descriptor={descriptor} soundSession={soundSession} onReturnTimeline={onReturnTimeline} />
    if (resolved.selection.kind === "visual-placement" && resolved.selection.primary.asset) return <VisualPreview mode="clip" asset={resolved.selection.primary.asset} clip={resolved.selection.primary.clip} document={document} soundSession={soundSession} onReturnTimeline={onReturnTimeline} />
  }
  const visualSelection = selection?.kind === "visual-placement" ? selection.primary.ref : null
  if (visualSession && hasVisualPlacements) return <TimelinePreview document={document} assets={assets} playheadMs={playheadMs} playback={playback} selection={visualSelection} session={visualSession} saving={visualSaving} />
  return <section className="timeline-preview-empty" aria-label="Timeline Preview">
    <WorkstationPaneHeader icon={<MonitorPlay />} title="Preview" actions={<PreviewModeLabel mode="timeline" />} />
    <div><Waves /><b>Timeline Preview</b><small>Add visual media, or select an audio clip to inspect and audition it.</small></div>
  </section>
}
