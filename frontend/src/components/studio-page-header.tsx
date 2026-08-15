import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import "./studio-page-header.css"

export function StudioPageHeader({ eyebrow, title, description, actions, className }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return <header className={cn("studio-page-header", className)}>
    <div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="studio-page-header-actions">{actions}</div>}
  </header>
}
