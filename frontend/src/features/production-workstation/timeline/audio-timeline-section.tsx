import { AudioWaveform, Film, Lock, MoreHorizontal, Music2, Pause, Plus, RadioTower, Repeat2, Trash2, Volume1, Volume2, VolumeX } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

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
import type { SoundScene, SoundSceneClip, SoundSceneTrack } from "@/types/domain"
import { soundClipSourceUrl } from "@/features/sound-scene/engine/sound-clip-source"
import type { SoundSceneEngineState } from "@/features/sound-scene/engine/sound-scene-engine"
import { soundTrackDisplayName, type SoundClipRef, type SoundSelection } from "@/features/sound-scene/engine/sound-scene-session"
import { dbToGain, formatDb, gainToDb, MAX_GAIN_DB, MIN_GAIN_DB } from "@/features/sound-scene/sound-scene-gain"
import { loopBoundaryTimes, waveformPeakIndex, type WaveformProjection } from "@/features/sound-scene/timeline/waveform-projection"

const SAMPLE_RATE = 48_000
const PEAK_TIERS = [128, 256, 512, 1024, 2048, 4096] as const

function roleColor(role?: string | null) {
  const palette = ["violet", "blue", "teal", "amber", "rose"]
  const hash = Array.from(String(role || "voice")).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function audioCategory(value?: string | null, sourceMediaType?: string | null) {
  if (sourceMediaType === "video") return "video"
  const category = String(value || "other").toLowerCase()
  return category === "music" ? "music" : category === "sfx" ? "sfx" : "other"
}

function trackCategory(track: SoundSceneTrack) {
  const categories = new Set(track.clips.map((clip) => audioCategory(clip.asset_kind, clip.source_media_type)))
  return categories.size === 1 ? [...categories][0]! : "other"
}

function CanvasWaveform({ url, projection }: { url?: string; projection?: WaveformProjection }) {
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
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = getComputedStyle(node).color
      context.globalAlpha = .62
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const columns = Math.max(1, Math.min(4_096, Math.ceil(width)))
      const bar = width / columns
      for (let column = 0; column < columns; column += 1) {
        const index = projection
          ? waveformPeakIndex(column, columns, peaks.length, projection)
          : Math.min(peaks.length - 1, Math.floor(column / columns * peaks.length))
        const peak = peaks[index] || 0
        const peakHeight = peak * height * .82
        if (peakHeight > 0) context.fillRect(column * bar, (height - peakHeight) / 2, Math.max(.7, bar * .58), peakHeight)
      }
      if (projection?.loop) {
        context.globalAlpha = .24
        for (const boundary of loopBoundaryTimes(projection)) context.fillRect(Math.round(boundary / projection.clipDuration * width), 0, 1, height)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(node)
    return () => observer.disconnect()
  }, [peaks, projection?.clipDuration, projection?.loop, projection?.sourceDuration, projection?.sourceOffset])
  if (!url || peaks?.length === 0) return <span className="sound-scene-waveform-state is-unavailable" aria-hidden="true">Waveform unavailable</span>
  if (!peaks) return <span className="sound-scene-waveform-state is-loading" aria-hidden="true"><i /><i /><i /><i /></span>
  return <canvas ref={canvas} className="sound-scene-waveform" aria-hidden="true" />
}

function TrackGainControl({ name, volume, muted, collapsed, onChange, onCommit }: {
  name: string
  volume: number
  muted: boolean
  collapsed: boolean
  onChange: (volume: number) => void
  onCommit: (volume: number) => void
}) {
  const volumeDb = gainToDb(volume)
  const percentage = Math.round(volume * 100)
  return <Popover>
    <OperatorTooltip label={`Adjust ${name} gain`} detail={muted ? `Muted now · ${formatDb(volumeDb)} will apply when unmuted.` : `${percentage}% · ${formatDb(volumeDb)}`}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={cn("sound-track-gain-trigger", collapsed && "is-compact")} aria-label={`Adjust ${name} gain`}>
          {muted ? <VolumeX /> : <Volume1 />}{!collapsed && <span>{percentage}%</span>}
        </Button>
      </PopoverTrigger>
    </OperatorTooltip>
    <PopoverContent side="right" align="center" className="sound-track-volume-popover">
      <header><span><b>{name}</b><small>Track gain</small></span><strong>{percentage}%</strong></header>
      <div className="sound-track-volume-editor">
        <Slider
          orientation="vertical"
          inverted
          aria-label={`${name} gain`}
          value={[volumeDb]}
          min={MIN_GAIN_DB}
          max={MAX_GAIN_DB}
          step={.5}
          onKeyDownCapture={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
            event.preventDefault()
            event.stopPropagation()
            const next = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, volumeDb + (event.key === "ArrowUp" ? .5 : -.5)))
            onChange(dbToGain(next))
            onCommit(dbToGain(next))
          }}
          onValueChange={([value = 0]) => onChange(dbToGain(value))}
          onValueCommit={([value = 0]) => onCommit(dbToGain(value))}
        />
        <span>{muted ? "Muted" : formatDb(volumeDb)}</span>
      </div>
    </PopoverContent>
  </Popover>
}

function SoundTrackControl({ track, volume, collapsed, soloed, soloSuppressed, onMute, onSolo, onVolumeChange, onVolumeCommit, onAdd, onRemove }: {
  track: SoundSceneTrack
  volume: number
  collapsed: boolean
  soloed: boolean
  soloSuppressed: boolean
  onMute: () => void
  onSolo: () => void
  onVolumeChange: (volume: number) => void
  onVolumeCommit: (volume: number) => void
  onAdd: () => void
  onRemove: () => void
}) {
  const name = soundTrackDisplayName(track)
  const category = trackCategory(track)
  const TrackIcon = category === "sfx" ? AudioWaveform : category === "video" ? Film : Music2
  const volumeDb = gainToDb(volume)
  const state = track.muted ? "Muted" : soloed ? "Solo" : soloSuppressed ? "Outside solo" : formatDb(volumeDb)
  const summary = `${name} · ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"} · ${state}`
  return <div className={cn("sound-track-control", collapsed && "is-compact", track.muted && "is-muted", soloed && "is-solo", soloSuppressed && "is-solo-suppressed")}>
    <div className="sound-track-select" title={summary}>
      <span className={cn("sound-track-icon", `is-category-${category}`, track.muted && "is-muted")}><TrackIcon /></span>
      {!collapsed && <span className="sound-track-copy"><b>{name}</b><small className="is-technical">{track.muted ? "MUTED" : soloed ? "SOLO" : soloSuppressed ? "Outside solo" : `${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}`}</small></span>}
    </div>
    {collapsed ? <div className="sound-track-compact-actions">
      <OperatorTooltip label={track.muted ? `Unmute ${name}` : `Mute ${name}`} detail="A persistent mix decision used by preview and export."><Button variant="ghost" size="icon-sm" className={cn("sound-track-letter", track.muted && "is-active is-mute")} aria-label={track.muted ? `Unmute ${name}` : `Mute ${name}`} aria-pressed={track.muted} onClick={onMute}>M</Button></OperatorTooltip>
      <OperatorTooltip label={soloed ? `Remove ${name} from Solo` : `Solo ${name}`} detail="Temporary audition only. Script stays audible and export is unchanged."><Button variant="ghost" size="icon-sm" className={cn("sound-track-letter", soloed && "is-active is-solo")} aria-label={soloed ? `Remove ${name} from Solo` : `Solo ${name}`} aria-pressed={soloed} onClick={onSolo}>S</Button></OperatorTooltip>
      <TrackGainControl name={name} volume={volume} muted={track.muted} collapsed onChange={onVolumeChange} onCommit={onVolumeCommit} />
      <DropdownMenu><OperatorTooltip label={`More actions for ${name}`} detail="Add an Audio Library clip or permanently remove this track."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Track actions for ${name}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent side="right" align="center"><DropdownMenuItem onSelect={onAdd}><Plus /> Add audio clip</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Remove “{name}”</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div> : <div className="sound-track-mix">
      <OperatorTooltip label={track.muted ? `Unmute ${name}` : `Mute ${name}`} detail="A persistent mix decision used by preview and export."><Button variant="ghost" size="icon-sm" className={cn("sound-track-letter", track.muted && "is-active is-mute")} aria-label={track.muted ? `Unmute ${name}` : `Mute ${name}`} aria-pressed={track.muted} onClick={onMute}>M</Button></OperatorTooltip>
      <OperatorTooltip label={soloed ? `Remove ${name} from Solo` : `Solo ${name}`} detail="Temporary audition only. Script stays audible and export is unchanged."><Button variant="ghost" size="icon-sm" className={cn("sound-track-letter", soloed && "is-active is-solo")} aria-label={soloed ? `Remove ${name} from Solo` : `Solo ${name}`} aria-pressed={soloed} onClick={onSolo}>S</Button></OperatorTooltip>
      <TrackGainControl name={name} volume={volume} muted={track.muted} collapsed={false} onChange={onVolumeChange} onCommit={onVolumeCommit} />
      <OperatorIconButton label={`Add audio to ${name}`} detail="Choose an Audio Library source and place it in this exact track." className="sound-track-add" onClick={onAdd}><Plus /></OperatorIconButton>
      <OperatorIconButton label={`Remove ${name}`} detail={`Permanently removes the track and its ${track.clips.length} placement${track.clips.length === 1 ? "" : "s"}.`} onClick={onRemove}><Trash2 /></OperatorIconButton>
    </div>}
  </div>
}

export function AudioTrackHeaders({ tracks, engineTracks, collapsed, soloTrackIds, sequenceSummary, onMute, onSolo, onVolumeChange, onVolumeCommit, onAdd, onRemove }: {
  tracks: SoundSceneTrack[]
  engineTracks: SoundSceneEngineState["tracks"]
  collapsed: boolean
  soloTrackIds: string[]
  sequenceSummary: string
  onMute: (track: SoundSceneTrack) => void
  onSolo: (track: SoundSceneTrack) => void
  onVolumeChange: (track: SoundSceneTrack, volume: number) => void
  onVolumeCommit: (track: SoundSceneTrack, volume: number) => void
  onAdd: (track: SoundSceneTrack) => void
  onRemove: (track: SoundSceneTrack) => void
}) {
  const byId = new Map(engineTracks.map((track) => [track.id, track]))
  return <>
    <div className="sound-sequence-control" title={collapsed ? `Script · ${sequenceSummary}` : undefined}><span className="sound-track-icon is-sequence"><Volume2 /></span>{!collapsed && <span className="sound-track-copy"><b>Script</b><small className="is-technical">{sequenceSummary}</small></span>}</div>
    {tracks.map((track) => <SoundTrackControl key={track.id} track={track} collapsed={collapsed} soloed={soloTrackIds.includes(track.id)} soloSuppressed={soloTrackIds.length > 0 && !soloTrackIds.includes(track.id)} volume={byId.get(track.id)?.volume ?? track.volume} onMute={() => onMute(track)} onSolo={() => onSolo(track)} onVolumeChange={(volume) => onVolumeChange(track, volume)} onVolumeCommit={(volume) => onVolumeCommit(track, volume)} onAdd={() => onAdd(track)} onRemove={() => onRemove(track)} />)}
  </>
}

export function AudioTimelineSection({ scene, tracks, engineTracks, selection, selectedRefs, soloTrackIds, pixelsPerSecond, styleFor, currentClip, onSelectPart, onSelectClip, onGesture, onAdd, onPan }: {
  scene: SoundScene
  tracks: SoundSceneTrack[]
  engineTracks: SoundSceneEngineState["tracks"]
  selection: SoundSelection
  selectedRefs: SoundClipRef[]
  soloTrackIds: string[]
  pixelsPerSecond: number
  styleFor: (start: number, duration: number, minimum?: number) => CSSProperties
  currentClip: (trackId: string, clipId: string) => SoundSceneClip | null
  onSelectPart: (partId: number) => void
  onSelectClip: (event: ReactPointerEvent | React.MouseEvent | React.KeyboardEvent, trackId: string, clipId: string) => void
  onGesture: (event: ReactPointerEvent, trackId: string, clipId: string, mode: "move" | "left" | "right" | "gain" | "fade-in" | "fade-out") => void
  onAdd: (trackId: string) => void
  onPan: (event: ReactPointerEvent) => void
}) {
  const byId = new Map(engineTracks.map((track) => [track.id, track]))
  const sequence = byId.get("sequence-projection")
  return <>
    <div className="sound-scene-lane is-sequence" onPointerDown={onPan}>
      {scene.resolved.sequence_projection.spans.map((span) => {
        const clip = sequence?.clips.find((item) => item.id === `sequence:${span.part_public_id}`)
        const start = Number(clip?.startSample || 0) / SAMPLE_RATE
        const duration = Number(clip?.durationSamples || 0) / SAMPLE_RATE
        if (span.silence) {
          const clipWidth = duration * pixelsPerSecond
          const partNumber = String(Number(span.position ?? 0) + 1).padStart(2, "0")
          return <button key={span.part_public_id} className={cn("sound-sequence-silence", selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration)} onClick={() => onSelectPart(span.part_id)} aria-label={`Pause Part ${partNumber} · ${duration.toFixed(1)} seconds`} title={`Part ${partNumber} · Pause ${duration.toFixed(1)} seconds`}>{clipWidth >= 28 && <span><Pause />{clipWidth >= 54 && <b>{duration.toFixed(1)}s</b>}</span>}</button>
        }
        const activeEffects = span.mix.effects.filter((effect) => effect.enabled).length
        return <button key={span.part_public_id} className={cn("sound-sequence-clip", `is-${roleColor(span.role)}`, selection?.kind === "part" && selection.id === span.part_id && "is-selected")} style={styleFor(start, duration, 18)} onClick={() => onSelectPart(span.part_id)}><CanvasWaveform url={span.filename ? audioUrl(span.filename) : undefined} /><span><em>{String(Number(span.position ?? 0) + 1).padStart(2, "0")}</em><b>{span.role || span.voice_name || span.title || "Speech"}</b></span>{(span.mix.muted || activeEffects > 0) && <span className="sound-clip-states">{span.mix.muted && <i title="Muted"><VolumeX /></i>}{activeEffects > 0 && <i title={`${activeEffects} active effect${activeEffects === 1 ? "" : "s"}`}><RadioTower /><b>{activeEffects}</b></i>}</span>}</button>
      })}
    </div>
    {tracks.map((track) => {
      const engineTrack = byId.get(track.id)
      const soloed = soloTrackIds.includes(track.id)
      const soloSuppressed = soloTrackIds.length > 0 && !soloed
      return <div className={cn("sound-scene-lane is-music", track.muted && "is-muted", soloed && "is-solo", soloSuppressed && "is-solo-suppressed")} key={track.id} onPointerDown={onPan}>
        {(track.muted || soloed || soloSuppressed) && <span className="sound-lane-audibility is-technical">{track.muted ? "MUTED" : soloed ? "SOLO" : "NOT SOLOED"}</span>}
        {track.clips.map((clip) => {
          const current = engineTrack?.clips.find((item) => item.id === clip.id)
          if (!current || clip.orphan) return null
          const start = current.startSample / SAMPLE_RATE
          const duration = current.durationSamples / SAMPLE_RATE
          const selected = selectedRefs.some((ref) => ref.trackId === track.id && ref.clipId === clip.id)
          const live = selected ? currentClip(track.id, clip.id) || clip : clip
          const activeEffects = live.effects.filter((effect) => effect.enabled).length
          const fadeIn = Math.min(duration, live.fade_in_ms / 1_000)
          const fadeOut = Math.min(duration, live.fade_out_ms / 1_000)
          const gainPosition = Math.max(9, Math.min(89, 54 - gainToDb(live.gain) * 1.36))
          const category = audioCategory(live.asset_kind, live.source_media_type)
          const ClipIcon = category === "sfx" ? AudioWaveform : category === "video" ? Film : Music2
          return <div key={clip.id} role="button" tabIndex={0} data-timeline-shortcut-surface="true" className={cn("sound-music-clip", `is-category-${category}`, selected && "is-selected", live.locked && "is-locked")} style={styleFor(start, duration, 24)} onPointerDown={(event) => onGesture(event, track.id, clip.id, "move")} onClick={(event) => { if (event.detail === 0) onSelectClip(event, track.id, clip.id) }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectClip(event, track.id, clip.id) } }}>
            <CanvasWaveform url={soundClipSourceUrl(clip) || undefined} projection={{ clipDuration: duration, sourceDuration: Math.max(.001, Number(live.source_duration_ms || live.resolved_duration_ms || live.duration_ms || 0) / 1_000), sourceOffset: Number(live.source_offset_ms || 0) / 1_000, loop: Boolean(live.loop) }} />
            <span className="sound-music-label"><ClipIcon /><span><b>{clip.asset_name || soundTrackDisplayName(track)}</b><small>{formatDb(gainToDb(live.gain))}</small></span></span>
            {(live.locked || live.muted || live.loop || activeEffects > 0) && <span className="sound-clip-states">{live.locked && <i title="Locked"><Lock /></i>}{live.muted && <i title="Muted"><VolumeX /></i>}{live.loop && <i title="Looped source" aria-label="Looped source"><Repeat2 /></i>}{activeEffects > 0 && <i title={`${activeEffects} active effect${activeEffects === 1 ? "" : "s"}`}><RadioTower /><b>{activeEffects}</b></i>}</span>}
            {selected && !live.locked && <><OperatorTooltip label="Trim clip start" detail="Drag to change the used source window."><button className="sound-trim-handle is-start" aria-label="Trim start" onPointerDown={(event) => onGesture(event, track.id, clip.id, "left")} /></OperatorTooltip><OperatorTooltip label="Trim clip end" detail="Drag to change the audible duration."><button className="sound-trim-handle is-end" aria-label="Trim end" onPointerDown={(event) => onGesture(event, track.id, clip.id, "right")} /></OperatorTooltip><div className="sound-gain-line" style={{ top: `${gainPosition}%` }} onPointerDown={(event) => onGesture(event, track.id, clip.id, "gain")}><i /></div><svg className="sound-fade-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M 0 100 L ${fadeIn / duration * 100} 0 L ${100 - fadeOut / duration * 100} 0 L 100 100`} /></svg><OperatorTooltip label="Adjust fade in" detail="Drag to shape how this clip enters."><button className="sound-fade-handle is-in" style={{ left: `${fadeIn / duration * 100}%` }} aria-label="Fade in" onPointerDown={(event) => onGesture(event, track.id, clip.id, "fade-in")} /></OperatorTooltip><OperatorTooltip label="Adjust fade out" detail="Drag to shape how this clip leaves."><button className="sound-fade-handle is-out" style={{ left: `${(1 - fadeOut / duration) * 100}%` }} aria-label="Fade out" onPointerDown={(event) => onGesture(event, track.id, clip.id, "fade-out")} /></OperatorTooltip></>}
          </div>
        })}
        {!track.clips.length && <button className="sound-empty-lane" onClick={() => onAdd(track.id)}><Plus /> Add audio clip</button>}
      </div>
    })}
  </>
}
