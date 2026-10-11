import type { CSSProperties, ReactNode } from "react"

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
  compactActions,
  style,
  color,
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
  compactActions?: ReactNode
  style?: CSSProperties
  color?: string
}) {
  const hasActions = Boolean(collapsed ? compactActions : stateActions || structureActions)
  return <div
    className={cn("timeline-track-header", collapsed && "is-compact", className)}
    data-has-actions={hasActions}
    title={title ?? (collapsed ? name : undefined)}
    style={style}
    data-track-color={color}
  >
    <span className={cn("timeline-track-header-icon", iconClassName)}>{icon}</span>
    {!collapsed && (identity || <span className="timeline-track-header-copy"><b>{name}</b></span>)}
    {hasActions && <div className="timeline-track-header-actions">
      {collapsed ? compactActions : <>
      {stateActions && <div className="timeline-track-header-state-actions">{stateActions}</div>}
      {structureActions && <div className="timeline-track-header-structure-actions">{structureActions}</div>}
      </>}
    </div>}
  </div>
}
