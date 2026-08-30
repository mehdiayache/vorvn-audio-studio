import { Check, Lock, MoreHorizontal, Pause, Pencil, Plus, RadioTower, Repeat2, Trash2, Volume1, VolumeX } from "lucide-react"
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { TimelineTrackHeader } from "@/components/timeline-track-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { SequenceMixOverride, SoundScene, SoundSceneClip, SoundSceneTrack } from "@/types/domain"
import { soundClipSourceUrl } from "@/features/sound-scene/engine/sound-clip-source"
import type { SoundSceneEngineState } from "@/features/sound-scene/engine/sound-scene-engine"
import { soundTrackDisplayName, type SoundClipRef, type SoundSelection } from "@/features/sound-scene/engine/sound-scene-session"
import { AudioVolumeControl, type AudioVolumeMix } from "@/features/sound-scene/components/audio-volume-control"
import { SoundMediaIcon, soundClipMediaKind } from "@/features/sound-scene/sound-media-icon"
import { AUDIO_FAMILY_LABELS, audioTrackRole, type AudioFamily } from "@/features/sound-scene/audio-presentation"
import { gainToDb, gainToVolumePercent } from "@/features/sound-scene/sound-scene-gain"
import { SequenceTimelineClip } from "./sequence-timeline-clip"
import { TimelineCanvasWaveform } from "./timeline-canvas-waveform"

const SAMPLE_RATE = 48_000

function TrackVolumeControl({ name, volume, muted, collapsed, onChange, onCommit }: {
  name: string
  volume: number
  muted: boolean
  collapsed: boolean
  onChange: (mix: AudioVolumeMix) => void
  onCommit: (mix: AudioVolumeMix) => void
}) {
  const percentage = muted || volume <= 0 ? 0 : gainToVolumePercent(volume)
  return <Popover>
    <OperatorTooltip label={`Adjust ${name} volume`} detail={muted || volume <= 0 ? "Muted · open to restore or choose a new volume." : `${percentage}% of the source level.`}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={cn("sound-track-gain-trigger", collapsed && "is-compact")} aria-label={`Adjust ${name} volume`}>
          {muted || volume <= 0 ? <VolumeX /> : <Volume1 />}{!collapsed && <span>{percentage}%</span>}
        </Button>
      </PopoverTrigger>
    </OperatorTooltip>
    <PopoverContent side="right" align="center" className="sound-track-volume-popover">
      <AudioVolumeControl label={`${name} volume`} gain={volume} muted={muted} showMute={false} compact onPreview={onChange} onCommit={onCommit} />
    </PopoverContent>
  </Popover>
}

function SoundTrackControl({ track, volume, collapsed, soloed, soloSuppressed, onMute, onSolo, onVolumeChange, onVolumeCommit, onAdd, onRename, onRole, onRemove }: {
  track: SoundSceneTrack
  volume: number
  collapsed: boolean
  soloed: boolean
  soloSuppressed: boolean
  onMute: () => void
  onSolo: () => void
  onVolumeChange: (mix: AudioVolumeMix) => void
  onVolumeCommit: (mix: AudioVolumeMix) => void
  onAdd: () => void
  onRename: (name: string) => void
  onRole: (role: AudioFamily) => void
  onRemove: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(track.name)
  const name = soundTrackDisplayName(track)
  const category = audioTrackRole(track)
  const state = track.muted || volume <= 0 ? "Muted" : soloed ? "Solo" : soloSuppressed ? "Outside solo" : `${gainToVolumePercent(volume)}%`
  const summary = `${name} · ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"} · ${state}`
  const actions = <>
      <OperatorTooltip label={track.muted ? `Unmute ${name}` : `Mute ${name}`} detail="A persistent mix decision used by preview and export."><Button variant="ghost" size="icon-sm" className={cn("sound-track-letter", track.muted && "is-active is-mute")} aria-label={track.muted ? `Unmute ${name}` : `Mute ${name}`} aria-pressed={track.muted} onClick={onMute}>M</Button></OperatorTooltip>
      <OperatorTooltip label={soloed ? `Remove ${name} from Solo` : `Solo ${name}`} detail="Temporary audition only. Script stays audible and export is unchanged."><Button variant="ghost" size="icon-sm" className={cn("sound-track-letter", soloed && "is-active is-solo")} aria-label={soloed ? `Remove ${name} from Solo` : `Solo ${name}`} aria-pressed={soloed} onClick={onSolo}>S</Button></OperatorTooltip>
      <TrackVolumeControl name={name} volume={volume} muted={track.muted} collapsed={collapsed} onChange={onVolumeChange} onCommit={onVolumeCommit} />
      {!collapsed && <OperatorIconButton label={`Add audio to ${name}`} detail="Choose an Audio Library source and place it in this exact track." className="sound-track-add" onClick={onAdd}><Plus /></OperatorIconButton>}
      <TrackActions name={name} role={category} renaming={renaming} draftName={draftName} onRenaming={setRenaming} onDraftName={setDraftName} onRename={onRename} onRole={onRole} onAdd={onAdd} onRemove={onRemove} />
    </>
  return <TimelineTrackHeader
    className={cn("is-audio", track.muted && "is-muted", soloed && "is-solo", soloSuppressed && "is-solo-suppressed")}
    collapsed={collapsed}
    icon={<SoundMediaIcon kind={category} />}
    iconClassName={cn(`is-category-${category}`, track.muted && "is-muted")}
    name={name}
    meta={track.muted ? "MUTED" : soloed ? "SOLO" : soloSuppressed ? "Outside solo" : `${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}`}
    title={summary}
    actions={actions}
  />
}

function TrackActions({ name, role, renaming, draftName, onRenaming, onDraftName, onRename, onRole, onAdd, onRemove }: {
  name: string; role: AudioFamily; renaming: boolean; draftName: string
  onRenaming: (value: boolean) => void; onDraftName: (value: string) => void
  onRename: (name: string) => void; onRole: (role: AudioFamily) => void; onAdd: () => void; onRemove: () => void
}) {
  const commitName = () => { const next = draftName.trim(); if (next && next !== name) onRename(next); onRenaming(false) }
  return <DropdownMenu onOpenChange={(open) => { if (open) { onDraftName(name); onRenaming(false) } }}><OperatorTooltip label={`More actions for ${name}`} detail="Rename or classify this track without restricting the audio it can contain."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Track actions for ${name}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent side="right" align="center" className="sound-track-actions-menu">
    {renaming ? <div className="sound-track-rename" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitName() } if (event.key === "Escape") onRenaming(false) }}><Input autoFocus value={draftName} maxLength={120} onChange={(event) => onDraftName(event.target.value)} aria-label={`Rename ${name}`} /><Button size="sm" onClick={commitName}>Save</Button></div> : <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onRenaming(true) }}><Pencil /> Rename track</DropdownMenuItem>}
    <DropdownMenuSeparator />
    {(Object.keys(AUDIO_FAMILY_LABELS) as AudioFamily[]).map((value) => <DropdownMenuItem key={value} onSelect={() => onRole(value)}>{value === role ? <Check /> : <SoundMediaIcon kind={value} />} {AUDIO_FAMILY_LABELS[value]}</DropdownMenuItem>)}
    <DropdownMenuSeparator /><DropdownMenuItem onSelect={onAdd}><Plus /> Add audio clip</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Remove “{name}”</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
}

export function AudioTrackHeaders({ tracks, engineTracks, collapsed, soloTrackIds, sequenceSummary, onMute, onSolo, onVolumeChange, onVolumeCommit, onAdd, onRename, onRole, onRemove }: {
  tracks: SoundSceneTrack[]
  engineTracks: SoundSceneEngineState["tracks"]
  collapsed: boolean
  soloTrackIds: string[]
  sequenceSummary: string
  onMute: (track: SoundSceneTrack) => void
  onSolo: (track: SoundSceneTrack) => void
  onVolumeChange: (track: SoundSceneTrack, mix: AudioVolumeMix) => void
  onVolumeCommit: (track: SoundSceneTrack, mix: AudioVolumeMix) => void
  onAdd: (track: SoundSceneTrack) => void
  onRename: (track: SoundSceneTrack, name: string) => void
  onRole: (track: SoundSceneTrack, role: AudioFamily) => void
  onRemove: (track: SoundSceneTrack) => void
}) {
  const byId = new Map(engineTracks.map((track) => [track.id, track]))
  return <>
    <TimelineTrackHeader className="is-sequence" collapsed={collapsed} icon={<SoundMediaIcon kind="speech" />} iconClassName="is-sequence" name="Script" meta={sequenceSummary} />
    {tracks.map((track) => <SoundTrackControl key={track.id} track={track} collapsed={collapsed} soloed={soloTrackIds.includes(track.id)} soloSuppressed={soloTrackIds.length > 0 && !soloTrackIds.includes(track.id)} volume={byId.get(track.id)?.volume ?? track.volume} onMute={() => onMute(track)} onSolo={() => onSolo(track)} onVolumeChange={(volume) => onVolumeChange(track, volume)} onVolumeCommit={(volume) => onVolumeCommit(track, volume)} onAdd={() => onAdd(track)} onRename={(name) => onRename(track, name)} onRole={(role) => onRole(track, role)} onRemove={() => onRemove(track)} />)}
  </>
}

export function AudioTimelineSection({ scene, tracks, engineTracks, selection, selectedRefs, soloTrackIds, pixelsPerSecond, styleFor, currentClip, onSelectPart, onPreviewPartMix, onCommitPartMix, onSelectClip, onGesture, onAdd, onPan, saving }: {
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
  onPreviewPartMix: (partPublicId: string, changes: Partial<SequenceMixOverride>) => void
  onCommitPartMix: (partPublicId: string, changes: Partial<SequenceMixOverride>) => void
  onSelectClip: (event: ReactPointerEvent | React.MouseEvent | React.KeyboardEvent, trackId: string, clipId: string) => void
  onGesture: (event: ReactPointerEvent, trackId: string, clipId: string, mode: "move" | "left" | "right" | "gain" | "fade-in" | "fade-out") => void
  onAdd: (trackId: string) => void
  onPan: (event: ReactPointerEvent) => void
  saving: boolean
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
        return <SequenceTimelineClip
          key={span.part_public_id}
          span={span}
          selected={selection?.kind === "part" && selection.id === span.part_id}
          saving={saving}
          pixelsPerSecond={pixelsPerSecond}
          style={styleFor(start, duration, 18)}
          onSelect={() => onSelectPart(span.part_id)}
          onPreview={(changes) => onPreviewPartMix(span.part_public_id, changes)}
          onCommit={(changes) => onCommitPartMix(span.part_public_id, changes)}
        />
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
          const category = soundClipMediaKind(live)
          return <div key={clip.id} role="button" tabIndex={0} data-timeline-shortcut-surface="true" className={cn("sound-music-clip", `is-category-${category}`, selected && "is-selected", live.locked && "is-locked")} style={styleFor(start, duration, 24)} onPointerDown={(event) => onGesture(event, track.id, clip.id, "move")} onClick={(event) => { if (event.detail === 0) onSelectClip(event, track.id, clip.id) }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectClip(event, track.id, clip.id) } }}>
            <TimelineCanvasWaveform url={soundClipSourceUrl(clip) || undefined} projection={{ clipDuration: duration, sourceDuration: Math.max(.001, Number(live.source_duration_ms || live.resolved_duration_ms || live.duration_ms || 0) / 1_000), sourceOffset: Number(live.source_offset_ms || 0) / 1_000, loop: Boolean(live.loop) }} />
            <span className="sound-music-label"><SoundMediaIcon kind={category} /><span><b>{clip.asset_name || soundTrackDisplayName(track)}</b><small>{live.muted || live.gain <= 0 ? "0%" : `${gainToVolumePercent(live.gain)}%`}</small></span></span>
            {(live.locked || live.muted || live.loop || activeEffects > 0) && <span className="sound-clip-states">{live.locked && <i title="Locked"><Lock /></i>}{live.muted && <i title="Muted"><VolumeX /></i>}{live.loop && <i title="Looped source" aria-label="Looped source"><Repeat2 /></i>}{activeEffects > 0 && <i title={`${activeEffects} active effect${activeEffects === 1 ? "" : "s"}`}><RadioTower /><b>{activeEffects}</b></i>}</span>}
            {selected && !live.locked && <><OperatorTooltip label="Trim clip start" detail="Drag to change the used source window."><button className="sound-trim-handle is-start" aria-label="Trim start" onPointerDown={(event) => onGesture(event, track.id, clip.id, "left")} /></OperatorTooltip><OperatorTooltip label="Trim clip end" detail="Drag to change the audible duration."><button className="sound-trim-handle is-end" aria-label="Trim end" onPointerDown={(event) => onGesture(event, track.id, clip.id, "right")} /></OperatorTooltip><div className="sound-gain-line" style={{ top: `${gainPosition}%` }} onPointerDown={(event) => onGesture(event, track.id, clip.id, "gain")}><i /></div><svg className="sound-fade-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M 0 100 L ${fadeIn / duration * 100} 0 L ${100 - fadeOut / duration * 100} 0 L 100 100`} /></svg><OperatorTooltip label="Adjust fade in" detail="Drag to shape how this clip enters."><button className="sound-fade-handle is-in" style={{ left: `${fadeIn / duration * 100}%` }} aria-label="Fade in" onPointerDown={(event) => onGesture(event, track.id, clip.id, "fade-in")} /></OperatorTooltip><OperatorTooltip label="Adjust fade out" detail="Drag to shape how this clip leaves."><button className="sound-fade-handle is-out" style={{ left: `${(1 - fadeOut / duration) * 100}%` }} aria-label="Fade out" onPointerDown={(event) => onGesture(event, track.id, clip.id, "fade-out")} /></OperatorTooltip></>}
          </div>
        })}
        {!track.clips.length && <button className="sound-empty-lane" onClick={() => onAdd(track.id)}><Plus /> Add audio clip</button>}
      </div>
    })}
  </>
}
