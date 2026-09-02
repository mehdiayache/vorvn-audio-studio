import type { RefObject } from "react"

import { cn } from "@/lib/utils"
import type { DurableJob, ProjectPart, VoiceDirectory } from "@/types/domain"
import { CollapsedPaneSummary } from "../workstation-stage-support"
import {
  WorkstationOutline, WorkstationSequence, type SequenceInsertKind,
  type WorkstationPartActions, type WorkstationPartState,
} from "../workstation-sequence"

export function ScriptStage({ centerPaneRef, parts, selectedId, playingKey, playerPlaying, liveJobs, directory, actions, outlineOpen, collapsedNumber, collapsedState, onSelect, onOutlineOpenChange, onAddEnd }: {
  centerPaneRef: RefObject<HTMLElement | null>
  parts: ProjectPart[]
  selectedId: number | null
  playingKey?: string
  playerPlaying: boolean
  liveJobs: Record<string, DurableJob<unknown>>
  directory: VoiceDirectory
  actions: WorkstationPartActions
  outlineOpen: boolean
  collapsedNumber: string
  collapsedState: WorkstationPartState
  onSelect: (part: ProjectPart) => void
  onOutlineOpenChange: (open: boolean) => void
  onAddEnd: (kind: SequenceInsertKind) => void
}) {
  return <>
    <aside className={cn("ws-left-pane", !outlineOpen && "is-collapsed")} aria-label="Script navigation">
      {outlineOpen
        ? <WorkstationOutline parts={parts} selectedId={selectedId} playingKey={playingKey} playerPlaying={playerPlaying} directory={directory} onSelect={onSelect} onCollapse={() => onOutlineOpenChange(false)} />
        : <CollapsedPaneSummary label="outline" number={collapsedNumber} state={collapsedState} playing={playerPlaying} onExpand={() => onOutlineOpenChange(true)} />}
    </aside>
    <main className="ws-center-pane" ref={centerPaneRef}>
      <WorkstationSequence parts={parts} selectedId={selectedId} playingKey={playingKey} playerPlaying={playerPlaying} liveJobs={liveJobs} directory={directory} actions={actions} onAddEnd={onAddEnd} />
    </main>
  </>
}
