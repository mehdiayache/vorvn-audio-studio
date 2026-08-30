import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Film, Image as ImageIcon, Lock, MoreHorizontal, Pencil, Plus, Scissors, Trash2, Unlock } from "lucide-react"
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { SelectionBar } from "@/components/selection-bar"
import { TimelineTrackHeader } from "@/components/timeline-track-header"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import type { AudioVolumeMix } from "@/features/sound-scene/components/audio-volume-control"
import { SelectionVolumeControl } from "@/features/sound-scene/components/selection-volume-control"
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
  const meta = track.visible ? media.label : `Hidden · ${media.label}`
  const identity = renaming ? <Input className="timeline-track-name-input" defaultValue={displayName} autoFocus aria-label="Track name" onBlur={(event) => { onRename(event.target.value); setRenaming(false) }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false) }} /> : <span className="timeline-track-header-copy" onDoubleClick={() => setRenaming(true)}><b>{displayName}</b><small className="is-technical">{meta}</small></span>
  const actions = <>
      <OperatorIconButton label={`Add ${displayName.toLowerCase()} to ${displayName} track`} detail="Choose a compatible Director Asset and place it in this exact track at the playhead." className="visual-track-add" onClick={onAdd}><Plus /></OperatorIconButton>
      <OperatorIconButton label={track.visible ? `Hide ${displayName}` : `Show ${displayName}`} detail="Controls the monitor without deleting media placements." onClick={onVisible}>{track.visible ? <Eye /> : <EyeOff />}</OperatorIconButton>
      {!collapsed && <OperatorIconButton label={track.locked ? `Unlock ${displayName}` : `Lock ${displayName}`} detail="Prevents accidental movement and trimming on this track." className={cn(track.locked && "is-active")} onClick={onLocked}>{track.locked ? <Lock /> : <Unlock />}</OperatorIconButton>}
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
    </>
  return <TimelineTrackHeader
    className={cn("is-visual", !track.visible && "is-hidden", track.locked && "is-locked")}
    collapsed={collapsed}
    icon={<TrackIcon />}
    iconClassName="is-visual"
    name={displayName}
    meta={meta}
    identity={identity}
    actions={actions}
  />
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
    <span>{isVideo && <Film />}<b>{name}</b>{locked && <i className="visual-clip-lock-status" aria-label="Locked placement"><Lock aria-hidden="true" /></i>}</span>
    {selected && !locked && <><button className="visual-trim-handle is-start" aria-label="Resize media start" onPointerDown={(event) => onGesture(event, "start")} /><button className="visual-trim-handle is-end" aria-label="Resize media end" onPointerDown={(event) => onGesture(event, "end")} /></>}
  </div>
}

export function VisualContextToolbar({ count = 1, track, clip, asset, saving, canSplit, hasAudio = false, audioGain = 1, audioMuted = false, selectionLocked = clip.locked, onAudioVolumePreview, onAudioVolume, onSplit, onLock, onDuplicate, onDelete }: {
  count?: number
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  saving: boolean
  canSplit: boolean
  hasAudio?: boolean
  audioGain?: number
  audioMuted?: boolean
  selectionLocked?: boolean
  onAudioVolumePreview?: (mix: AudioVolumeMix) => void
  onAudioVolume?: (mix: AudioVolumeMix) => void
  onSplit: () => void
  onLock?: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const label = count > 1 ? `${count} media clips` : asset ? visualAssetName(asset) : "Missing media"
  const meta = count > 1 ? "Media selection" : asset?.media_type === "video" ? "Video clip" : "Image clip"
  const mixActions = count === 1 && asset?.media_type === "video" && hasAudio && onAudioVolume
    ? <SelectionVolumeControl label="Video volume" detail="Adjust or mute this video's embedded audio without changing its picture or timing." gain={audioGain} muted={audioMuted} disabled={saving} onPreview={onAudioVolumePreview} onCommit={onAudioVolume} />
    : undefined
  const objectActions = <>
    {onLock && <OperatorIconButton label={selectionLocked ? count > 1 ? "Unlock selected media" : "Unlock media placement" : count > 1 ? "Lock selected media" : "Lock media placement"} detail={track.locked ? "Unlock the track before changing these placements." : selectionLocked ? "Allows timing, trimming and framing changes again." : "Protects timing, trimming and framing from accidental changes."} className={cn("selection-bar-command", selectionLocked && "is-locked")} disabled={saving || track.locked} onClick={onLock}>{selectionLocked ? <Lock /> : <Unlock />}</OperatorIconButton>}
    {count === 1 && asset?.media_type === "video" && <OperatorIconButton label="Split video at playhead" detail={canSplit ? "Creates two non-destructive placements using the same source Asset." : "Place the playhead inside this video, at least 0.1 seconds from either edge."} className="selection-bar-command" disabled={saving || !canSplit || selectionLocked || track.locked} onClick={onSplit}><Scissors /></OperatorIconButton>}
    <OperatorIconButton label="Duplicate media placement" detail="Creates another Timeline placement using the same Director Asset." className="selection-bar-command" disabled={saving} onClick={onDuplicate}><Copy /></OperatorIconButton>
    <OperatorIconButton label="Remove media placement" detail={selectionLocked || track.locked ? "Unlock the placement or track before removing it." : "The Director Asset remains available."} className="selection-bar-command danger" disabled={saving || selectionLocked || track.locked} onClick={onDelete}><Trash2 /></OperatorIconButton>
  </>
  return <SelectionBar
    ariaLabel={`${label} actions`}
    icon={asset?.media_type === "video" ? <Film /> : <ImageIcon />}
    label={label}
    meta={meta}
    mixActions={mixActions}
    objectActions={objectActions}
  />
}
