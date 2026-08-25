import { ArrowRight, Building2, FileAudio2, Plus, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { VentureMark } from "@/components/venture-mark"
import { formatUpdated } from "@/lib/format"
import { resourceHref } from "@/lib/links"
import type { HierarchyNode } from "@/types/domain"
import { CreateVentureDialog } from "./create-venture-dialog"
import {
  NewResourceTile, WorkCollectionToolbar, WorkEmpty, WorkSection, type WorkSort,
} from "./work-primitives"
import "./work.css"

type VentureEntry = {
  venture: HierarchyNode
  projects: HierarchyNode[]
  productions: HierarchyNode[]
  latest?: HierarchyNode
}

function descendantsFor(venture: HierarchyNode, items: HierarchyNode[]) {
  const projects = items.filter((item) => item.type === "project" && item.parent_key === venture.key)
  const projectKeys = new Set(projects.map((item) => item.key))
  const seriesKeys = new Set(items.filter((item) => item.type === "series" && projectKeys.has(item.parent_key || "")).map((item) => item.key))
  const productions = items.filter((item) => item.type === "production" && (projectKeys.has(item.parent_key || "") || seriesKeys.has(item.parent_key || "")))
  const latest = [...productions].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
  return { projects, productions, latest }
}

function productionContext(production: HierarchyNode, items: HierarchyNode[]) {
  const parent = items.find((item) => item.key === production.parent_key)
  if (!parent) return ""
  if (parent.type === "project") return parent.name
  const project = items.find((item) => item.key === parent.parent_key)
  return [project?.name, parent.name].filter(Boolean).join(" / ")
}

export function VentureDirectoryPage({ items }: { items: HierarchyNode[] }) {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<WorkSort>("updated")
  const entries = useMemo<VentureEntry[]>(() => items.filter((item) => item.type === "venture").map((venture) => ({ venture, ...descendantsFor(venture, items) })), [items])
  const ventures = useMemo(() => entries.filter(({ venture }) => `${venture.name} ${venture.description}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === "name" ? a.venture.name.localeCompare(b.venture.name) : String(b.venture.updated_at || "").localeCompare(String(a.venture.updated_at || ""))), [entries, query, sort])
  const recent = useMemo(() => items.filter((item) => item.type === "production").sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 5), [items])

  return <main className="work-page work-home-page">
    <div className="work-home-inner">
      <header className="work-welcome"><div><span><Sparkles /> Auvi Studio</span><h1>Welcome back</h1><p>Choose a Venture, or continue the Production you were shaping.</p></div><Button onClick={() => setCreating(true)}><Plus /> New Venture</Button></header>

      {recent.length > 0 && <WorkSection title="Continue where you left off" description="Your most recently updated Productions." count={recent.length}>
        <div className="continue-strip">{recent.map((production) => <Link to={resourceHref("production", production.public_id)} className="continue-production" key={production.key}><span className="continue-production-icon"><FileAudio2 /></span><span><b>{production.name}</b><small>{productionContext(production, items)}{formatUpdated(production.updated_at) ? ` · ${formatUpdated(production.updated_at)}` : ""}</small></span><ArrowRight /></Link>)}</div>
      </WorkSection>}

      <WorkSection title="Ventures" description="Each Venture keeps its Projects, shared media and Productions together." count={entries.length}>
        <WorkCollectionToolbar query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} placeholder="Find a Venture" resultCount={ventures.length} sortOptions={[{ value: "updated", label: "Recently updated" }, { value: "name", label: "Name" }]} />
        {ventures.length ? <div className="venture-directory-grid">
          {ventures.map(({ venture, projects, productions, latest }) => <article className="venture-card" key={venture.key}>
            <Link className="venture-card-link" to={resourceHref("venture", venture.public_id)} aria-label={`Open Venture ${venture.name}`} />
            <VentureMark className="venture-brand-mark" identity={venture.icon} name={venture.name} />
            <div className="venture-card-copy"><h2>{venture.name}</h2><p>{venture.description || "A focused creative workspace."}</p><footer><span>{projects.length} Project{projects.length === 1 ? "" : "s"}</span><span>{productions.length} Production{productions.length === 1 ? "" : "s"}</span>{latest && <span>Latest: {latest.name}</span>}</footer></div>
            <ArrowRight className="venture-card-open" />
          </article>)}
          <NewResourceTile label="New Venture" description="Create a new brand or production boundary." onClick={() => setCreating(true)} />
        </div> : <WorkEmpty icon={<Building2 />} title={query ? "No matching Ventures" : "Create your first Venture"} description={query ? "Try another name or clear the search." : "A Venture holds related Projects, Media and Productions."} action={query ? <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button> : <Button onClick={() => setCreating(true)}><Plus /> New Venture</Button>} />}
      </WorkSection>
    </div>
    <CreateVentureDialog open={creating} onOpenChange={setCreating} />
  </main>
}
