import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Film, Image as ImageIcon, Lock, MoreHorizontal, Pencil, Plus, Scissors, Trash2, Unlock, Volume2, VolumeX } from "lucide-react"
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import { cn } from "@/lib/utils"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

function trackMediaSummary(track: VisualSceneTrack, assets: VentureAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  let images = 0
  let videos = 0
  let missing = 0
  for (const clip of track.clips) {
    const type = byId.get(clip.asset_id)?.media_type
    if (type === "image") images += 1
    else if (type === "video") videos += 1
    else missing += 1
  }
  const labels = [
    images ? `${images} image${images === 1 ? "" : "s"}` : "",
    videos ? `${videos} video${videos === 1 ? "" : "s"}` : "",
    missing ? `${missing} missing` : "",
  ].filter(Boolean)
  return {
    images,
    videos,
    missing,
    label: labels.join(" · ") || "Empty track",
  }
}

export function visualTrackDisplayName(track: VisualSceneTrack, assets: VentureAsset[]) {
  void assets
  return track.name.trim() || (track.media_type === "video" ? "Video" : "Image")
}

export function VisualTrackControl({ track, assets, collapsed, first, last, onVisible, onLocked, onAdd, onMove, onRename, onRemove }: {
  track: VisualSceneTrack
  assets: VentureAsset[]
  collapsed: boolean
  first: boolean
  last: boolean
  onVisible: () => void
  onLocked: () => void
  onAdd: () => void
  onMove: (direction: -1 | 1) => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const media = trackMediaSummary(track, assets)
  const displayName = visualTrackDisplayName(track, assets)
  const TrackIcon = track.media_type === "video" ? Film : ImageIcon
  return <div className={cn("visual-track-control", collapsed && "is-compact", !track.visible && "is-hidden", track.locked && "is-locked")} title={collapsed ? `${displayName} · ${track.visible ? media.label : `Hidden · ${media.label}`}` : undefined}>
    <span className="sound-track-icon is-visual"><TrackIcon /></span>
    {!collapsed && (renaming ? <Input className="visual-track-name-input" defaultValue={displayName} autoFocus aria-label="Track name" onBlur={(event) => { onRename(event.target.value); setRenaming(false) }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false) }} /> : <span className="sound-track-copy" onDoubleClick={() => setRenaming(true)}><b>{displayName}</b><small className={cn((!track.visible || track.clips.length > 0) && "is-technical")}>{track.visible ? media.label : `Hidden · ${media.label}`}</small></span>)}
    <div className="visual-track-actions">
      <OperatorIconButton label={`Add ${displayName.toLowerCase()} to ${displayName} track`} detail="Choose a compatible Director Asset and place it in this exact track at the playhead." className="visual-track-add" onClick={onAdd}><Plus /></OperatorIconButton>
      <OperatorIconButton label={track.visible ? `Hide ${displayName}` : `Show ${displayName}`} detail="Controls the monitor without deleting media placements." onClick={onVisible}>{track.visible ? <Eye /> : <EyeOff />}</OperatorIconButton>
      {!collapsed && <OperatorIconButton label={track.locked ? `Unlock ${displayName}` : `Lock ${displayName}`} detail="Prevents accidental movement and trimming on this track." onClick={onLocked}>{track.locked ? <Lock /> : <Unlock />}</OperatorIconButton>}
      <DropdownMenu>
        <OperatorTooltip label={`More actions for ${displayName}`}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${displayName}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip>
        <DropdownMenuContent side="right" align="center">
          <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}><ChevronUp /> Move track up</DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}><ChevronDown /> Move track down</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(true)}><Pencil /> Rename track</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Remove “{displayName}”</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
}

export function VisualTimelineClip({ clip, asset, selected, trackLocked, style, onSelect, onGesture }: {
  clip: VisualSceneClip
  asset?: VentureAsset
  selected: boolean
  trackLocked: boolean
  style: CSSProperties
  onSelect: (event: SyntheticEvent) => void
  onGesture: (event: ReactPointerEvent, edge: "move" | "start" | "end") => void
}) {
  const locked = clip.locked || trackLocked
  const name = asset ? visualAssetName(asset) : "Missing media"
  const isVideo = asset?.media_type === "video"
  const thumbnailUrl = asset ? (isVideo ? visualAssetPosterUrl(asset) : visualAssetUrl(asset)) : ""
  return <div className={cn("visual-timeline-clip", isVideo ? "is-video" : "is-image", selected && "is-selected", locked && "is-locked", !asset && "is-missing")} style={style} role="button" tabIndex={0} aria-label={`${name} media clip`} onPointerDown={(event) => onGesture(event, "move")} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(event) } }}>
    {asset ? <figure className="visual-timeline-thumbnail" style={isVideo ? undefined : { backgroundImage: `url(${JSON.stringify(thumbnailUrl)})` }}><img src={thumbnailUrl} alt="" draggable={false} /></figure> : <ImageIcon />}
    <span>{isVideo && <Film />}<b>{name}</b></span>
    {locked && <i><Lock /></i>}
    {selected && !locked && <><button className="visual-trim-handle is-start" aria-label="Resize media start" onPointerDown={(event) => onGesture(event, "start")} /><button className="visual-trim-handle is-end" aria-label="Resize media end" onPointerDown={(event) => onGesture(event, "end")} /></>}
  </div>
}

export function VisualContextToolbar({ count = 1, track, clip, asset, saving, canSplit, hasAudio = false, audioMuted, onAudioMute, onSplit, onLock, onDuplicate, onDelete }: {
  count?: number
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  saving: boolean
  canSplit: boolean
  hasAudio?: boolean
  audioMuted?: boolean
  onAudioMute?: () => void
  onSplit: () => void
  onLock: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return <div className="visual-context-toolbar">
    <span>{asset?.media_type === "video" ? <Film /> : <ImageIcon />}<b>{count > 1 ? `${count} media clips` : asset ? visualAssetName(asset) : "Missing media"}</b>{count === 1 && <small>{asset?.media_type === "video" ? `Source ${(clip.source_offset_ms / 1000).toFixed(1)}s · ` : ""}{(clip.start_ms / 1000).toFixed(1)}s · {(clip.duration_ms / 1000).toFixed(1)}s</small>}</span>
    {count === 1 && asset?.media_type === "video" && <OperatorIconButton label="Split video at playhead" detail={canSplit ? "Creates two non-destructive placements using the same source Asset." : "Place the playhead inside this video, at least 0.1 seconds from either edge."} disabled={saving || !canSplit} onClick={onSplit}><Scissors /></OperatorIconButton>}
    {count === 1 && asset?.media_type === "video" && (hasAudio && onAudioMute
      ? <OperatorIconButton label={audioMuted ? "Unmute video audio" : "Mute video audio"} detail="Changes only this video's sound; picture timing stays unchanged." disabled={saving} onClick={onAudioMute}>{audioMuted ? <VolumeX /> : <Volume2 />}</OperatorIconButton>
      : <OperatorIconButton label="No audio" detail="This video source has no audio stream." disabled><VolumeX /></OperatorIconButton>)}
    <OperatorIconButton label={clip.locked ? "Unlock media clip" : "Lock media clip"} detail={track.locked ? "Unlock the track before changing this placement." : undefined} disabled={saving || track.locked} onClick={onLock}>{clip.locked ? <Unlock /> : <Lock />}</OperatorIconButton>
    <OperatorIconButton label="Duplicate media placement" detail="Creates another Timeline placement using the same Director Asset." disabled={saving} onClick={onDuplicate}><Copy /></OperatorIconButton>
    <OperatorIconButton label="Remove media placement" detail="The Director Asset remains available." className="danger" disabled={saving || clip.locked || track.locked} onClick={onDelete}><Trash2 /></OperatorIconButton>
  </div>
}
