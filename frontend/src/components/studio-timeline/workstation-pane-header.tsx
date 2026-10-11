import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function WorkstationPaneHeader({ icon, title, actions, className, heading = false }: {
  icon?: ReactNode
  title: ReactNode
  actions?: ReactNode
  className?: string
  heading?: boolean
}) {
  return <header className={cn("workstation-pane-header", className)}>
    <span className="workstation-pane-title">{icon}{heading ? <h2>{title}</h2> : <b>{title}</b>}</span>
    {actions && <div className="workstation-pane-actions">{actions}</div>}
  </header>
}
