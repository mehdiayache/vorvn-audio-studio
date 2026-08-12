import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

import { audioStudioBase, resourceHref } from "@/lib/links"
import type { ResourceType, TrailItem } from "@/types/domain"
import { VentureMark } from "./venture-mark"
import "./shell-breadcrumbs.css"

type CurrentCrumb = { type: ResourceType; name: string; icon?: string }

function CrumbIdentity({ type, name, icon }: { type: ResourceType; name: string; icon?: string }) {
  return type === "venture" ? <VentureMark identity={icon} name={name} compact /> : null
}

export function ShellBreadcrumbs({ trail = [], current, className = "" }: {
  trail?: TrailItem[]
  current?: CurrentCrumb
  className?: string
}) {
  return <nav className={`shell-breadcrumbs ${className}`} aria-label="Location">
    <Link className="shell-breadcrumb-root" to={`${audioStudioBase}/`}>Ventures</Link>
    {trail.map((item) => <span className="shell-breadcrumb-item" key={`${item.type}:${item.id}`}><ChevronRight /><Link to={resourceHref(item.type, item.public_id)}><CrumbIdentity type={item.type} name={item.name} icon={item.icon || undefined} /><span>{item.name}</span></Link></span>)}
    {current && <span className="shell-breadcrumb-item"><ChevronRight /><b aria-current="page"><CrumbIdentity type={current.type} name={current.name} icon={current.icon} /><span>{current.name}</span></b></span>}
  </nav>
}
