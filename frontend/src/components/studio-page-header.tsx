import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { ShellBreadcrumbs } from "./shell-breadcrumbs"

import "./studio-page-header.css"

export function StudioPageHeader({ eyebrow, title, description, actions, className }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return <header className={cn("studio-page-header", className)}>
    <ShellBreadcrumbs leaf={title} />
    <div className="studio-page-header-main">
      <div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="studio-page-header-actions">{actions}</div>}
    </div>
  </header>
}
