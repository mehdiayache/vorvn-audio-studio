import { FileAudio2, FolderKanban, Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { VentureOverview } from "@/types/domain"
import { CreateProjectDialog } from "./create-project-dialog"
import { ProjectCardGrid } from "./project-card"
import { VentureSettingsDialog } from "./venture-settings-dialog"
import {
  ProductionRow, WorkCollectionToolbar, WorkEmpty, WorkPageHeader, WorkSection,
  type WorkSort,
} from "./work-primitives"
import { VentureMedia } from "./venture-media"
import "./work.css"

export function VenturePage({ data, refresh }: { data: VentureOverview; refresh: () => void }) {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<WorkSort>("updated")
  const venture = data.resource
  const editableVenture = { id: venture.id, public_id: venture.public_id, key: venture.key, type: "venture" as const, name: venture.name, description: venture.description, icon: venture.icon, updated_at: venture.updated_at, locked: venture.locked ?? undefined }
  const metrics = { project_count: data.projects.length, production_count: data.projects.reduce((sum, item) => sum + item.metrics.production_count, 0), part_count: data.projects.reduce((sum, item) => sum + item.metrics.part_count, 0), duration_ms: data.projects.reduce((sum, item) => sum + item.metrics.duration_ms, 0), total_cost: data.projects.reduce((sum, item) => sum + item.metrics.total_cost, 0) }
  const projects = useMemo(() => data.projects.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "duration" ? b.metrics.duration_ms - a.metrics.duration_ms : String(b.updated_at || "").localeCompare(String(a.updated_at || ""))), [data.projects, query, sort])

  return <main className="work-page">
    <WorkPageHeader kind="Venture" name={venture.name} icon={venture.icon} description={venture.description} metrics={metrics} actions={<VentureSettingsDialog venture={editableVenture} onUpdated={refresh} />} />
    <div className="work-content">
      <WorkSection title="Projects" description="Focused bodies of work inside this Venture." count={data.projects.length}>
        <WorkCollectionToolbar query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} placeholder="Find a Project" resultCount={projects.length} actions={<Button size="sm" onClick={() => setCreating(true)}><Plus /> New Project</Button>} />
        {projects.length ? <ProjectCardGrid projects={projects} venture={{ id: venture.id, public_id: venture.public_id, type: "venture", name: venture.name, icon: venture.icon }} onUpdated={refresh} onCreate={() => setCreating(true)} /> : <WorkEmpty icon={<FolderKanban />} title={query ? "No matching Projects" : "No Projects yet"} description={query ? "Try another name or clear the search." : "Create the first focused Project in this Venture."} action={query ? <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button> : <Button onClick={() => setCreating(true)}><Plus /> New Project</Button>} />}
      </WorkSection>
      <WorkSection title="Recent Productions" description="Continue the latest work across every Project." count={data.recent_productions.length}>
        {data.recent_productions.length ? <div className="production-summary-list">{data.recent_productions.map((production) => <ProductionRow production={production} showContext key={production.id} />)}</div> : <WorkEmpty compact icon={<FileAudio2 />} title="No Productions yet" description="Create a Production inside one of this Venture's Projects." />}
      </WorkSection>
      <VentureMedia ventureId={venture.id} summary={data.asset_summary} refresh={refresh} />
    </div>
    <CreateProjectDialog ventureId={venture.id} ventureName={venture.name} open={creating} onOpenChange={setCreating} onCreated={refresh} />
  </main>
}
