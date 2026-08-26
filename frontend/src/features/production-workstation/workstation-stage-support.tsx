import { AudioLines, ListMusic, PanelLeftOpen, Search } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { WorkstationPartState } from "./workstation-sequence"
import type { WorkstationStage } from "./workstation-workflow"

export function CollapsedPaneSummary({ label, number, state, playing, onExpand }: {
  label: string
  number: string
  state: WorkstationPartState
  playing: boolean
  onExpand: () => void
}) {
  return <div className="ws-collapsed-pane">
    <OperatorTooltip label={`Show ${label}`} side="right"><Button className="ws-pane-expand" variant="ghost" size="icon-sm" aria-label={`Show ${label}`} onClick={onExpand}><PanelLeftOpen /></Button></OperatorTooltip>
    <span className={cn("ws-collapsed-context", playing && "is-playing")} title={playing ? `${label} ${number} is playing` : `${label} ${number}`}>
      <b>{number}</b>
      <i className={`is-${state}`} />
      {playing && <AudioLines aria-hidden="true" />}
    </span>
  </div>
}

export function EmptyInspector({ stage }: { stage: WorkstationStage }) {
  const copy = stage === "sequence"
    ? ["Select a story part", "Its text, captions and technical details stay here while the full Script remains visible."]
    : stage === "sound"
      ? ["Select a clip or track", "Choose Script or Audio Library clips directly on the timeline to shape them here."]
      : ["Release inspector", "Issues and finishing evidence stay beside the output workspace."]
  return <div className="ws-empty-inspector"><span><Search /></span><h3>{copy[0]}</h3><p>{copy[1]}</p></div>
}

export function AudioGroupInspector({ count }: { count: number }) {
  return <div className="ws-empty-inspector">
    <span><ListMusic /></span>
    <h3>{count} audio clips selected</h3>
    <p>Drag any selected clip to move the group together. Shared mute, lock, duplicate and remove actions stay in the toolbar.</p>
  </div>
}
