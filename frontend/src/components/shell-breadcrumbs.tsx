import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

import { OriginsMark } from "@/components/origins-mark"
import { originsBase } from "@/lib/links"
import "./shell-breadcrumbs.css"

export type ShellBreadcrumbItem = { label: string; href?: string }

export function ShellBreadcrumbs({ leaf, items, className = "" }: {
  leaf?: string
  items?: ShellBreadcrumbItem[]
  className?: string
}) {
  const trail = items || (leaf ? [{ label: leaf }] : [])
  return <nav className={`shell-breadcrumbs ${className}`.trim()} aria-label="Location">
    <Link className="shell-breadcrumb-root" to={`${originsBase}/`}><OriginsMark /><span>Origins</span></Link>
    {trail.map((item, index) => <span className="shell-breadcrumb-item" key={`${item.href || "current"}-${item.label}`}>
      <ChevronRight />
      {item.href && index < trail.length - 1
        ? <Link to={item.href}>{item.label}</Link>
        : <b aria-current={index === trail.length - 1 ? "page" : undefined}>{item.label}</b>}
    </span>)}
  </nav>
}
