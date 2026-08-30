import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SelectionBarProps = {
  ariaLabel: string
  icon: ReactNode
  label: string
  meta: string
  metaTechnical?: boolean
  mixActions?: ReactNode
  objectActions?: ReactNode
  className?: string
}

export function SelectionBar({ ariaLabel, icon, label, meta, metaTechnical = false, mixActions, objectActions, className }: SelectionBarProps) {
  return <div className={cn("selection-bar", className)} aria-label={ariaLabel}>
    <div className="selection-bar-identity">
      <span className="selection-bar-identity-icon" aria-hidden="true">{icon}</span>
      <span className="selection-bar-identity-copy">
        <b title={label}>{label}</b>
        <small className={cn(metaTechnical && "is-technical")}>{meta}</small>
      </span>
    </div>
    {(mixActions || objectActions) && <div className="selection-bar-actions">
      {mixActions && <div className="selection-bar-group is-mix" aria-label="Mix actions">{mixActions}</div>}
      {objectActions && <div className="selection-bar-group is-object" aria-label="Placement actions">{objectActions}</div>}
    </div>}
  </div>
}
