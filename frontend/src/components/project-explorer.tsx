import { ChevronRight, FileAudio2, FolderKanban, Layers3, Search, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { resourceHref } from "@/lib/links"
import type { HierarchyNode } from "@/types/domain"

function typeLabel(node: HierarchyNode) {
  return node.type === "series" ? "Series" : node.type.slice(0, 1).toUpperCase() + node.type.slice(1)
}

export function ProductionExplorer({ nodes, activeKey }: { nodes: HierarchyNode[]; activeKey: string }) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const parents = new Set<string>()
    let current = nodes.find((node) => node.key === activeKey)
    while (current?.parent_key) {
      parents.add(current.parent_key)
      current = nodes.find((node) => node.key === current?.parent_key)
    }
    return parents
  })
  const children = useMemo(() => {
    const map = new Map<string | null, HierarchyNode[]>()
    nodes.forEach((node) => map.set(node.parent_key, [...(map.get(node.parent_key) || []), node]))
    return map
  }, [nodes])
  const normalized = query.trim().toLocaleLowerCase()

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function hasMatchingDescendant(key: string): boolean {
    return (children.get(key) || []).some((child) => child.name.toLocaleLowerCase().includes(normalized) || hasMatchingDescendant(child.key))
  }

  function renderNode(node: HierarchyNode, depth = 0): React.ReactNode {
    const descendants = children.get(node.key) || []
    const hasChildren = descendants.length > 0
    const isOpen = expanded.has(node.key)
    const matches = !normalized || node.name.toLocaleLowerCase().includes(normalized)
    const nestedMatches = normalized && hasMatchingDescendant(node.key)
    if (!matches && !nestedMatches) return null
    const Icon = node.type === "venture" ? Sparkles : node.type === "project" ? FolderKanban : node.type === "series" ? Layers3 : FileAudio2
    return (
      <div key={node.key}>
        <div className={cn("tree-row", node.key === activeKey && "active")} role="treeitem" aria-level={depth + 1} aria-current={node.key === activeKey ? "page" : undefined} style={{ "--tree-depth": Math.min(depth, 3) } as React.CSSProperties}>
          <button className="tree-toggle" onClick={() => toggle(node.key)} aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={hasChildren ? isOpen : undefined} disabled={!hasChildren}>
            {hasChildren && <ChevronRight className={cn(isOpen && "open")} />}
          </button>
          <a href={resourceHref(node.type, node.public_id)} title={node.name}>
            <Icon className="tree-icon" />
            <span><b>{node.name}</b><small>{typeLabel(node)}</small></span>
          </a>
        </div>
        {(isOpen || normalized) && node.type === "project" ? <ProjectChildren nodes={descendants} depth={depth + 1} renderNode={renderNode} /> : (isOpen || normalized) && descendants.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <aside className="project-explorer">
      <div className="explorer-head"><b>Production explorer</b><span>{nodes.filter((n) => n.type === "venture").length} ventures</span></div>
      <label className="explorer-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a Production" /></label>
      <ScrollArea className="explorer-scroll"><div className="tree" role="tree" aria-label="Production hierarchy">{(children.get(null) || []).map((node) => renderNode(node))}</div></ScrollArea>
    </aside>
  )
}

function ProjectChildren({ nodes, depth, renderNode }: { nodes: HierarchyNode[]; depth: number; renderNode: (node: HierarchyNode, depth: number) => React.ReactNode }) {
  const series = nodes.filter((node) => node.type === "series")
  const standalone = nodes.filter((node) => node.type === "production")
  return <>{series.length > 0 && <div className="tree-group"><span style={{ "--tree-depth": Math.min(depth, 3) } as React.CSSProperties}>Series</span>{series.map((node) => renderNode(node, depth))}</div>}{standalone.length > 0 && <div className="tree-group"><span style={{ "--tree-depth": Math.min(depth, 3) } as React.CSSProperties}>Standalone</span>{standalone.map((node) => renderNode(node, depth))}</div>}</>
}
