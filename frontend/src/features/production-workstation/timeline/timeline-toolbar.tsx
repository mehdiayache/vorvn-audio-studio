import { AudioWaveform, ChevronLeft, ChevronRight, Image as ImageIcon, LocateFixed, Magnet, Plus, Redo2, Undo2 } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { TimelineHistoryDomain } from "./use-timeline-history"

const domainLabel = (domain: TimelineHistoryDomain) => domain === "visual" ? "visual" : "audio"

export function TimelineToolbar({ summary, canUndo, canRedo, undoDomain, redoDomain, saving, snapping, followPlayhead, hasVisualScene, onUndo, onRedo, onMoveView, onSnappingChange, onFollowPlayheadChange, onAddVisual, onAddAudio }: {
  summary: string
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
  return <div className="sound-scene-toolbar">
    <span className="sound-scene-toolbar-title"><b>Timeline</b><small>{summary}</small></span>
    <div className="sound-scene-history">
      <OperatorTooltip label={`Undo the latest ${domainLabel(undoDomain)} edit`} detail="Timeline remembers whether the latest saved edit changed audio or visuals." disabledTrigger={!canUndo || saving}><Button variant="ghost" size="sm" disabled={!canUndo || saving} onClick={onUndo} aria-label={`Undo ${domainLabel(undoDomain)} edit`}><Undo2 /><span>Undo</span></Button></OperatorTooltip>
      <OperatorTooltip label={`Redo the latest undone ${domainLabel(redoDomain)} edit`} disabledTrigger={!canRedo || saving}><Button variant="ghost" size="sm" disabled={!canRedo || saving} onClick={onRedo} aria-label={`Redo ${domainLabel(redoDomain)} edit`}><Redo2 /><span>Redo</span></Button></OperatorTooltip>
    </div>
    <div className="sound-scene-viewport-tools">
      <OperatorTooltip label="Move one view earlier"><Button variant="ghost" size="icon-sm" aria-label="Previous view" onClick={() => onMoveView(-1)}><ChevronLeft /></Button></OperatorTooltip>
      <OperatorTooltip label="Move one view later"><Button variant="ghost" size="icon-sm" aria-label="Next view" onClick={() => onMoveView(1)}><ChevronRight /></Button></OperatorTooltip>
      <OperatorTooltip label={snapping ? "Turn snapping off" : "Turn snapping on"} detail="Aligns clip edges to the playhead, Script Parts, and other clip edges. Hold Alt while dragging to bypass it temporarily."><Button variant="ghost" size="icon-sm" className={snapping ? "is-active" : undefined} aria-label={snapping ? "Turn snapping off" : "Turn snapping on"} aria-pressed={snapping} onClick={() => onSnappingChange(!snapping)}><Magnet /></Button></OperatorTooltip>
      <OperatorTooltip label="Keep the playhead visible during playback"><Button variant="ghost" size="sm" className={followPlayhead ? "is-active" : undefined} aria-pressed={followPlayhead} onClick={() => onFollowPlayheadChange(!followPlayhead)}><LocateFixed /><span>Follow</span></Button></OperatorTooltip>
    </div>
    <span className="sound-scene-save-state">{saving && <b>Saving…</b>}</span>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Plus data-icon="inline-start" /> Add to Timeline</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="sound-scene-add-menu">
        <DropdownMenuLabel>Place media at playhead</DropdownMenuLabel>
        <DropdownMenuGroup>
          {hasVisualScene && <DropdownMenuItem onSelect={onAddVisual}><ImageIcon /> Image or video from Director</DropdownMenuItem>}
          <DropdownMenuItem onSelect={onAddAudio}><AudioWaveform /> Audio from Library</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
}
