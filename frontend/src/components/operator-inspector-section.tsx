import type { LucideIcon } from "lucide-react"
import { CircleHelp } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { OperatorTooltip } from "./operator-tooltip"

import "./operator-inspector-section.css"

export function OperatorInspectorSection({ icon: Icon, title, meta, metaTechnical = false, help, actions, className, children }: {
  icon?: LucideIcon
  title: string
  meta?: ReactNode
  metaTechnical?: boolean
  help?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return <section className={cn("operator-inspector-section", className)}>
    <header className="operator-inspector-heading">
      {Icon && <span className="operator-inspector-heading-icon"><Icon /></span>}
      <h3>{title}</h3>
      {meta !== undefined && <span className={cn("operator-inspector-heading-meta", metaTechnical && "is-technical")}>{meta}</span>}
      {actions}
      {help && <OperatorTooltip label={`About ${title}`} detail={help}><span className="operator-inspector-heading-help" tabIndex={0} aria-label={`About ${title}`}><CircleHelp /></span></OperatorTooltip>}
    </header>
    <div className="operator-inspector-section-body">{children}</div>
  </section>
}
