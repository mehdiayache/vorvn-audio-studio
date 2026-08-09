import { ChevronRight } from "lucide-react"

import { audioStudioBase, resourceHref } from "@/lib/links"
import type { ResourceType, TrailItem } from "@/types/domain"
import { VentureMark } from "./venture-mark"

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
    <a className="shell-breadcrumb-root" href={`${audioStudioBase}/`}>Ventures</a>
    {trail.map((item) => <span className="shell-breadcrumb-item" key={`${item.type}:${item.id}`}><ChevronRight /><a href={resourceHref(item.type, item.public_id)}><CrumbIdentity type={item.type} name={item.name} icon={item.icon} /><span>{item.name}</span></a></span>)}
    {current && <span className="shell-breadcrumb-item"><ChevronRight /><b aria-current="page"><CrumbIdentity type={current.type} name={current.name} icon={current.icon} /><span>{current.name}</span></b></span>}
  </nav>
}
