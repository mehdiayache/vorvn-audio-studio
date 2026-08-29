import { Check, ChevronDown, ChevronRight, Clapperboard } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { audioStudioBase, resourceHref } from "@/lib/links"
import type { HierarchyNode, ResourceType, TrailItem } from "@/types/domain"
import { AudioStudioRailToggle } from "./app-shell"
import { isImageIdentity, VentureMark } from "./venture-mark"
import "./shell-breadcrumbs.css"

type CurrentCrumb = { type: ResourceType; name: string; icon?: string; id?: number; public_id?: string }
type Crumb = { type: ResourceType; name: string; icon?: string; id?: number; public_id?: string }

function CrumbIdentity({ type, name, icon }: { type: ResourceType; name: string; icon?: string }) {
  if (type === "venture") return <VentureMark identity={icon} name={name} compact />
  return icon && isImageIdentity(icon) ? <img className="shell-breadcrumb-image" src={icon} alt="" /> : null
}

function CrumbSwitcher({ item, tree, current = false }: { item: Crumb; tree: HierarchyNode[]; current?: boolean }) {
  const node = tree.find((candidate) => candidate.type === item.type && Number(candidate.id) === Number(item.id))
  const peers = node ? tree.filter((candidate) => candidate.type === node.type && candidate.parent_key === node.parent_key)
    .sort((left, right) => left.name.localeCompare(right.name)) : []
  if (!node || peers.length < 2) {
    const content = <><CrumbIdentity type={item.type} name={item.name} icon={item.icon} /><span>{item.name}</span></>
    return current ? <b aria-current="page">{content}</b> : <Link to={resourceHref(item.type, item.public_id!)}>{content}</Link>
  }
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="shell-breadcrumb-switcher" aria-current={current ? "page" : undefined}><CrumbIdentity type={item.type} name={item.name} icon={item.icon} /><span>{item.name}</span><ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="shell-breadcrumb-menu"><DropdownMenuLabel>Switch {item.type}</DropdownMenuLabel><DropdownMenuGroup>{peers.map((peer) => <DropdownMenuItem key={peer.key} asChild><Link to={resourceHref(peer.type, peer.public_id)}><CrumbIdentity type={peer.type} name={peer.name} icon={peer.icon || undefined} /><span>{peer.name}</span>{peer.id === node.id && <Check aria-label="Current" />}</Link></DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}

export function ShellBreadcrumbs({ trail = [], current, leaf, tree, className = "" }: {
  trail?: TrailItem[]
  current?: CurrentCrumb
  leaf?: string
  tree?: HierarchyNode[] | null
  className?: string
}) {
  return <nav className={`shell-breadcrumbs ${className}`} aria-label="Location">
    <AudioStudioRailToggle className="shell-breadcrumb-toggle" tooltipSide="bottom" />
    <Link className="shell-breadcrumb-root" to={`${audioStudioBase}/`}><Clapperboard /><span>Auvi Studio</span></Link>
    {trail.map((item) => <span className="shell-breadcrumb-item" key={`${item.type}:${item.id}`}><ChevronRight />{tree ? <CrumbSwitcher item={{ ...item, icon: item.icon || undefined }} tree={tree} /> : <Link to={resourceHref(item.type, item.public_id)}><CrumbIdentity type={item.type} name={item.name} icon={item.icon || undefined} /><span>{item.name}</span></Link>}</span>)}
    {current && <span className="shell-breadcrumb-item"><ChevronRight />{tree && current.id && current.public_id ? <CrumbSwitcher item={current} tree={tree} current /> : <b aria-current="page"><CrumbIdentity type={current.type} name={current.name} icon={current.icon} /><span>{current.name}</span></b>}</span>}
    {leaf && <span className="shell-breadcrumb-item"><ChevronRight /><b aria-current="page"><span>{leaf}</span></b></span>}
  </nav>
}
