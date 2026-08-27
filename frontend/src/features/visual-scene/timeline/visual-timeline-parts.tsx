import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Film, Image as ImageIcon, Layers3, Lock, MoreHorizontal, PencilLine, Plus, Scissors, Trash2, Unlock } from "lucide-react"
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import { cn } from "@/lib/utils"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

export function visualTrackDisplayName(name: string) {
  const legacy = /^Visual(?:\s+(\d+))?$/i.exec(name.trim())
  return legacy ? `Layer${legacy[1] ? ` ${legacy[1]}` : ""}` : name
}

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
    label: labels.join(" · ") || "Empty layer",
  }
}

export function VisualTrackControl({ track, assets, collapsed, first, last, onVisible, onLocked, onRename, onAdd, onMove, onRemove }: {
  track: VisualSceneTrack
  assets: VentureAsset[]
  collapsed: boolean
  first: boolean
  last: boolean
  onVisible: () => void
  onLocked: () => void
  onRename: (name: string) => Promise<void>
  onAdd: () => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const displayName = visualTrackDisplayName(track.name)
  const media = trackMediaSummary(track, assets)
  const TrackIcon = media.images && media.videos ? Layers3 : media.videos ? Film : media.images ? ImageIcon : Layers3
  const [name, setName] = useState(displayName)
  useEffect(() => { if (!editing) setName(displayName) }, [displayName, editing])
  async function commit() {
    const next = name.trim()
    if (next && next !== displayName) await onRename(next)
    else setName(displayName)
    setEditing(false)
  }
  return <div className={cn("visual-track-control", collapsed && "is-compact", !track.visible && "is-hidden", track.locked && "is-locked")} title={collapsed ? `${displayName} · ${track.visible ? media.label : `Hidden · ${media.label}`}` : undefined}>
    <span className="sound-track-icon is-visual"><TrackIcon /></span>
    {!collapsed && <span className="sound-track-copy">{editing ? <Input autoFocus aria-label={`Name ${displayName} layer`} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onBlur={() => void commit()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setName(displayName); setEditing(false) } }} /> : <button onClick={() => setEditing(true)}><b>{displayName}</b><PencilLine /></button>}<small>{track.visible ? media.label : `Hidden · ${media.label}`}</small></span>}
    <div className="visual-track-actions">
      <OperatorIconButton label={track.visible ? `Hide ${displayName}` : `Show ${displayName}`} detail="Controls the monitor without deleting media placements." onClick={onVisible}>{track.visible ? <Eye /> : <EyeOff />}</OperatorIconButton>
      {!collapsed && <OperatorIconButton label={track.locked ? `Unlock ${displayName}` : `Lock ${displayName}`} detail="Prevents accidental movement and trimming on this layer." onClick={onLocked}>{track.locked ? <Lock /> : <Unlock />}</OperatorIconButton>}
      <DropdownMenu>
        <OperatorTooltip label={`More actions for ${displayName}`}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${displayName}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip>
        <DropdownMenuContent side="right" align="center">
          <DropdownMenuItem onSelect={onAdd}><Plus /> Add media</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing(true)}><PencilLine /> Rename layer</DropdownMenuItem>
          <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}><ChevronUp /> Move layer up</DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}><ChevronDown /> Move layer down</DropdownMenuItem>
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
  onSelect: () => void
  onGesture: (event: ReactPointerEvent, edge: "move" | "start" | "end") => void
}) {
  const locked = clip.locked || trackLocked
  const name = asset ? visualAssetName(asset) : "Missing media"
  const isVideo = asset?.media_type === "video"
  return <div className={cn("visual-timeline-clip", selected && "is-selected", locked && "is-locked", !asset && "is-missing")} style={style} role="button" tabIndex={0} aria-label={`${name} media clip`} onPointerDown={(event) => onGesture(event, "move")} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect() } }}>
    {asset ? <img src={isVideo ? visualAssetPosterUrl(asset) : visualAssetUrl(asset)} alt="" draggable={false} /> : <ImageIcon />}
    <span>{isVideo && <Film />}<b>{name}</b></span>
    {locked && <i><Lock /></i>}
    {selected && !locked && <><button className="visual-trim-handle is-start" aria-label="Resize media start" onPointerDown={(event) => onGesture(event, "start")} /><button className="visual-trim-handle is-end" aria-label="Resize media end" onPointerDown={(event) => onGesture(event, "end")} /></>}
  </div>
}

export function VisualContextToolbar({ track, clip, asset, saving, canSplit, onSplit, onLock, onDuplicate, onDelete }: {
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  saving: boolean
  canSplit: boolean
  onSplit: () => void
  onLock: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return <div className="visual-context-toolbar">
    <span>{asset?.media_type === "video" ? <Film /> : <ImageIcon />}<b>{asset ? visualAssetName(asset) : "Missing media"}</b><small>{asset?.media_type === "video" ? `Source ${(clip.source_offset_ms / 1000).toFixed(1)}s · ` : ""}{(clip.start_ms / 1000).toFixed(1)}s · {(clip.duration_ms / 1000).toFixed(1)}s</small></span>
    {asset?.media_type === "video" && <OperatorTooltip disabledTrigger={saving || !canSplit} label="Split video at playhead" detail={canSplit ? "Creates two non-destructive placements using the same source Asset." : "Place the playhead inside this video, at least 0.1 seconds from either edge."}><Button variant="ghost" size="sm" disabled={saving || !canSplit} onClick={onSplit}><Scissors /> Split</Button></OperatorTooltip>}
    <OperatorTooltip label={clip.locked ? "Unlock media clip" : "Lock media clip"}><Button variant="ghost" size="sm" disabled={saving || track.locked} onClick={onLock}>{clip.locked ? <Unlock /> : <Lock />}{clip.locked ? "Unlock" : "Lock"}</Button></OperatorTooltip>
    <OperatorTooltip label="Duplicate media placement" detail="Creates another Timeline placement using the same Director Asset."><Button variant="ghost" size="sm" disabled={saving} onClick={onDuplicate}><Copy /> Duplicate</Button></OperatorTooltip>
    <OperatorTooltip label="Remove media placement" detail="The Director Asset remains available."><Button variant="ghost" size="sm" className="danger" disabled={saving || clip.locked || track.locked} onClick={onDelete}><Trash2 /> Remove</Button></OperatorTooltip>
  </div>
}
