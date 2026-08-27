import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Image as ImageIcon, Lock, MoreHorizontal, PencilLine, Plus, Trash2, Unlock } from "lucide-react"
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { visualAssetName, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import { cn } from "@/lib/utils"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

export function VisualTrackControl({ track, collapsed, first, last, onVisible, onLocked, onRename, onAdd, onMove, onRemove }: {
  track: VisualSceneTrack
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
  const [name, setName] = useState(track.name)
  useEffect(() => { if (!editing) setName(track.name) }, [editing, track.name])
  async function commit() {
    const next = name.trim()
    if (next && next !== track.name) await onRename(next)
    else setName(track.name)
    setEditing(false)
  }
  return <div className={cn("visual-track-control", collapsed && "is-compact", !track.visible && "is-hidden", track.locked && "is-locked")} title={collapsed ? `${track.name} · ${track.clips.length} images` : undefined}>
    <span className="sound-track-icon is-visual"><ImageIcon /></span>
    {!collapsed && <span className="sound-track-copy">{editing ? <Input autoFocus aria-label={`Name ${track.name} track`} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onBlur={() => void commit()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setName(track.name); setEditing(false) } }} /> : <button onClick={() => setEditing(true)}><b>{track.name}</b><PencilLine /></button>}<small>{track.visible ? `${track.clips.length} image${track.clips.length === 1 ? "" : "s"}` : "HIDDEN"}</small></span>}
    <div className="visual-track-actions">
      <OperatorIconButton label={track.visible ? `Hide ${track.name}` : `Show ${track.name}`} detail="Controls the visual monitor without deleting placements." onClick={onVisible}>{track.visible ? <Eye /> : <EyeOff />}</OperatorIconButton>
      {!collapsed && <OperatorIconButton label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`} detail="Prevents accidental movement and trimming on this track." onClick={onLocked}>{track.locked ? <Lock /> : <Unlock />}</OperatorIconButton>}
      <DropdownMenu>
        <OperatorTooltip label={`More actions for ${track.name}`}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${track.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip>
        <DropdownMenuContent side="right" align="center">
          <DropdownMenuItem onSelect={onAdd}><Plus /> Add image</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing(true)}><PencilLine /> Rename track</DropdownMenuItem>
          <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}><ChevronUp /> Move track up</DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}><ChevronDown /> Move track down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2 /> Remove “{track.name}”</DropdownMenuItem>
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
  const name = asset ? visualAssetName(asset) : "Missing image"
  return <div className={cn("visual-timeline-clip", selected && "is-selected", locked && "is-locked", !asset && "is-missing")} style={style} role="button" tabIndex={0} aria-label={`${name} visual clip`} onPointerDown={(event) => onGesture(event, "move")} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect() } }}>
    {asset ? <img src={visualAssetUrl(asset)} alt="" draggable={false} /> : <ImageIcon />}
    <span><b>{name}</b></span>
    {locked && <i><Lock /></i>}
    {selected && !locked && <><button className="visual-trim-handle is-start" aria-label="Resize visual start" onPointerDown={(event) => onGesture(event, "start")} /><button className="visual-trim-handle is-end" aria-label="Resize visual end" onPointerDown={(event) => onGesture(event, "end")} /></>}
  </div>
}

export function VisualContextToolbar({ track, clip, asset, saving, onLock, onDuplicate, onDelete }: {
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  saving: boolean
  onLock: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return <div className="visual-context-toolbar">
    <span><ImageIcon /><b>{asset ? visualAssetName(asset) : "Missing image"}</b><small>{(clip.start_ms / 1000).toFixed(1)}s · {(clip.duration_ms / 1000).toFixed(1)}s</small></span>
    <OperatorTooltip label={clip.locked ? "Unlock visual clip" : "Lock visual clip"}><Button variant="ghost" size="sm" disabled={saving || track.locked} onClick={onLock}>{clip.locked ? <Unlock /> : <Lock />}{clip.locked ? "Unlock" : "Lock"}</Button></OperatorTooltip>
    <OperatorTooltip label="Duplicate visual placement" detail="Creates another Timeline placement using the same Director Asset."><Button variant="ghost" size="sm" disabled={saving} onClick={onDuplicate}><Copy /> Duplicate</Button></OperatorTooltip>
    <OperatorTooltip label="Remove visual placement" detail="The Director Asset remains available."><Button variant="ghost" size="sm" className="danger" disabled={saving || clip.locked || track.locked} onClick={onDelete}><Trash2 /> Remove</Button></OperatorTooltip>
  </div>
}
