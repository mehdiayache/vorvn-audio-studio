import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function TimelineTrackHeader({
  className,
  collapsed,
  icon,
  iconClassName,
  name,
  meta,
  technicalMeta = true,
  identity,
  actions,
  title,
}: {
  className?: string
  collapsed: boolean
  icon: ReactNode
  iconClassName?: string
  name: string
  meta: string
  technicalMeta?: boolean
  identity?: ReactNode
  actions?: ReactNode
  title?: string
}) {
  return <div
    className={cn("timeline-track-header", collapsed && "is-compact", className)}
    data-has-actions={Boolean(actions)}
    title={title ?? (collapsed ? `${name} · ${meta}` : undefined)}
  >
    <span className={cn("timeline-track-header-icon", iconClassName)}>{icon}</span>
    {!collapsed && (identity || <span className="timeline-track-header-copy"><b>{name}</b><small className={cn(technicalMeta && "is-technical")}>{meta}</small></span>)}
    {actions && <div className="timeline-track-header-actions">{actions}</div>}
  </div>
}
