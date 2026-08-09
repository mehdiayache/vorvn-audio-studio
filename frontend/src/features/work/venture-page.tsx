import { FileAudio2, FolderKanban, Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { VentureOverview } from "@/types/domain"
import { CreateProjectDialog } from "./create-project-dialog"
import { ProjectCardGrid } from "./project-card"
import { VentureSettingsDialog } from "./venture-settings-dialog"
import { ProductionRow, WorkPageHeader, WorkSection } from "./work-primitives"
import { VentureMedia } from "./venture-media"

export function VenturePage({ data, refresh }: { data: VentureOverview; refresh: () => void }) {
  const [creating, setCreating] = useState(false)
  const venture = data.resource
  const metrics = { project_count: data.projects.length, production_count: data.projects.reduce((sum, item) => sum + item.metrics.production_count, 0), part_count: data.projects.reduce((sum, item) => sum + item.metrics.part_count, 0), duration_ms: data.projects.reduce((sum, item) => sum + item.metrics.duration_ms, 0), total_cost: data.projects.reduce((sum, item) => sum + item.metrics.total_cost, 0) }
  return <main className="work-page">
    <WorkPageHeader kind="Venture" name={venture.name} icon={venture.icon} description={venture.description} metrics={metrics} actions={<VentureSettingsDialog venture={venture} onUpdated={refresh} />} />
    <div className="work-content">
      <WorkSection title="Projects" action={<Button variant="outline" onClick={() => setCreating(true)}><Plus /> New Project</Button>}>
        {data.projects.length ? <ProjectCardGrid projects={data.projects} venture={{ id: venture.id, public_id: venture.public_id, type: "venture", name: venture.name, icon: venture.icon }} onUpdated={refresh} /> : <div className="work-empty compact"><FolderKanban /><h3>No Projects</h3><p>Create the first Project in this Venture.</p><Button onClick={() => setCreating(true)}><Plus /> New Project</Button></div>}
      </WorkSection>
      <VentureMedia ventureId={venture.id} summary={data.asset_summary} refresh={refresh} />
      <WorkSection title="Recent Productions">
        {data.recent_productions.length ? <div className="production-summary-list">{data.recent_productions.map((production) => <ProductionRow production={production} key={production.id} />)}</div> : <div className="work-empty compact"><FileAudio2 /><h3>No Productions</h3></div>}
      </WorkSection>
    </div>
    <CreateProjectDialog ventureId={venture.id} ventureName={venture.name} open={creating} onOpenChange={setCreating} onCreated={refresh} />
  </main>
}
