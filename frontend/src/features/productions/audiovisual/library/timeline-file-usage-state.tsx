import { CircleCheck } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"

import "./timeline-file-usage-state.css"

export function TimelineFileUsageState({ count = 1 }: { count?: number }) {
  const detail = count === 1
    ? "This File has one placement in the current Timeline."
    : `This File has ${count} placements in the current Timeline.`
  return <OperatorTooltip label="Used in Timeline" detail={detail} side="bottom">
    <span className="timeline-file-usage-state" tabIndex={0} aria-label="Used in Timeline">
      <CircleCheck /><span>{count > 1 ? count : "Used in Timeline"}</span>
    </span>
  </OperatorTooltip>
}
