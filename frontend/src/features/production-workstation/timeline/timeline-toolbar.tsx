import { ChevronLeft, ChevronRight, Image as ImageIcon, LocateFixed, Magnet, Plus, Redo2, Undo2 } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SoundMediaIcon } from "@/features/sound-scene/audio-presentation"
import type { TimelineHistoryDomain } from "./use-timeline-history"

const domainLabel = (domain: TimelineHistoryDomain) => domain === "visual" ? "visual" : "audio"

export function TimelineToolbar({ canUndo, canRedo, undoDomain, redoDomain, saving, snapping, followPlayhead, hasVisualScene, onUndo, onRedo, onMoveView, onSnappingChange, onFollowPlayheadChange, onAddVisual, onAddAudio }: {
  canUndo: boolean
  canRedo: boolean
  undoDomain: TimelineHistoryDomain
  redoDomain: TimelineHistoryDomain
  saving: boolean
  snapping: boolean
  followPlayhead: boolean
  hasVisualScene: boolean
  onUndo: () => void
  onRedo: () => void
  onMoveView: (direction: -1 | 1) => void
  onSnappingChange: (enabled: boolean) => void
  onFollowPlayheadChange: (enabled: boolean) => void
  onAddVisual: () => void
  onAddAudio: () => void
}) {
  return <div className="timeline-command-bar" aria-label="Timeline command bar">
    <div className="timeline-editing-tools" aria-label="Timeline editing tools">
      <span className="sound-scene-toolbar-title"><b>Timeline</b></span>
      <div className="sound-scene-history">
        <OperatorIconButton label={`Undo ${domainLabel(undoDomain)} edit`} detail="Timeline remembers whether the latest saved edit changed audio or visuals." disabled={!canUndo || saving} onClick={onUndo}><Undo2 /></OperatorIconButton>
        <OperatorIconButton label={`Redo ${domainLabel(redoDomain)} edit`} detail="Restores the latest Timeline edit you undid." disabled={!canRedo || saving} onClick={onRedo}><Redo2 /></OperatorIconButton>
      </div>
      <div className="sound-scene-viewport-tools">
        <OperatorTooltip label="Move one view earlier"><Button variant="ghost" size="icon-sm" aria-label="Previous view" onClick={() => onMoveView(-1)}><ChevronLeft /></Button></OperatorTooltip>
        <OperatorTooltip label="Move one view later"><Button variant="ghost" size="icon-sm" aria-label="Next view" onClick={() => onMoveView(1)}><ChevronRight /></Button></OperatorTooltip>
        <OperatorTooltip label={snapping ? "Turn snapping off" : "Turn snapping on"} detail="Aligns clip edges to the playhead, Script Parts, and other clip edges. Hold Alt while dragging to bypass it temporarily."><Button variant="ghost" size="icon-sm" className={snapping ? "is-active" : undefined} aria-label={snapping ? "Turn snapping off" : "Turn snapping on"} aria-pressed={snapping} onClick={() => onSnappingChange(!snapping)}><Magnet /></Button></OperatorTooltip>
        <OperatorTooltip label="Keep the playhead visible during playback"><Button variant="ghost" size="sm" className={followPlayhead ? "is-active" : undefined} aria-pressed={followPlayhead} onClick={() => onFollowPlayheadChange(!followPlayhead)}><LocateFixed /><span>Follow</span></Button></OperatorTooltip>
      </div>
    </div>
    <div className="timeline-insert-actions" aria-label="Timeline insert actions">
      <span className="sound-scene-save-state">{saving && <b>Saving…</b>}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Plus data-icon="inline-start" /> Add to Timeline</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="sound-scene-add-menu">
          <DropdownMenuLabel>Place media at playhead</DropdownMenuLabel>
          <DropdownMenuGroup>
            {hasVisualScene && <DropdownMenuItem onSelect={onAddVisual}><ImageIcon /> Image or video</DropdownMenuItem>}
            <DropdownMenuItem onSelect={onAddAudio}><SoundMediaIcon kind="audio" /> Audio</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
}
