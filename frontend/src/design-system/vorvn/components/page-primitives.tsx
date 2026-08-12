import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function ToolPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("vorvn-tool-page-header", className)}>
      <div>
        {eyebrow && <span className="vorvn-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="vorvn-tool-page-actions">{actions}</div>}
    </header>
  )
}

export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("vorvn-page-section", className)}>
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
