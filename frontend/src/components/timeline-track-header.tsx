import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function TimelineTrackHeader({
  className,
  collapsed,
  icon,
  iconClassName,
  name,
  identity,
  stateActions,
  structureActions,
  title,
}: {
  className?: string
  collapsed: boolean
  icon: ReactNode
  iconClassName?: string
  name: string
  identity?: ReactNode
  stateActions?: ReactNode
  structureActions?: ReactNode
  title?: string
}) {
  const hasActions = Boolean(stateActions || structureActions)
  return <div
    className={cn("timeline-track-header", collapsed && "is-compact", className)}
    data-has-actions={hasActions}
    title={title ?? (collapsed ? name : undefined)}
  >
    <span className={cn("timeline-track-header-icon", iconClassName)}>{icon}</span>
    {!collapsed && (identity || <span className="timeline-track-header-copy"><b>{name}</b></span>)}
    {hasActions && <div className="timeline-track-header-actions">
      {stateActions && <div className="timeline-track-header-state-actions">{stateActions}</div>}
      {structureActions && <div className="timeline-track-header-structure-actions">{structureActions}</div>}
    </div>}
  </div>
}
