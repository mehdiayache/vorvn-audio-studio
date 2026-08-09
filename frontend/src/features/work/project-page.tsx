import { FileAudio2, Layers3, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { studioApi } from "@/lib/api"
import { audioStudioBase } from "@/lib/links"
import type { ProductionSummary, ProjectOverview } from "@/types/domain"
import { CreateResourceDialog, type CreateKind } from "./create-resource-dialog"
import { ProjectSettingsDialog } from "./project-settings-dialog"
import { DropdownMenuItem, ProductionMenu, ProductionRow, SeriesCard, WorkPageHeader, WorkSection } from "./work-primitives"

function MoveProductionDialog({ production, data, open, onOpenChange, refresh }: { production: ProductionSummary | null; data: ProjectOverview; open: boolean; onOpenChange: (open: boolean) => void; refresh: () => void }) {
  const [saving, setSaving] = useState(false)
  async function move(seriesId: number) {
    if (!production) return
    setSaving(true)
    try { await studioApi.moveProduction(production.id, seriesId); onOpenChange(false); refresh(); toast.success(`Moved ${production.name}.`) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to move this Production.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add to a Series</DialogTitle><DialogDescription>Move {production?.name || "this Production"} into a Series in {data.resource.name}.</DialogDescription></DialogHeader><div className="move-series-list">{data.series.map((series) => <Button key={series.id} variant="outline" disabled={saving} onClick={() => void move(series.id)}><Layers3 /><span><b>{series.name}</b><small>{series.metrics.production_count} productions</small></span></Button>)}{!data.series.length && <p>Create a Series first.</p>}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button></DialogFooter></DialogContent></Dialog>
}

export function ProjectPage({ data, refresh }: { data: ProjectOverview; refresh: () => void }) {
  const [creating, setCreating] = useState<CreateKind | null>(null)
  const [moving, setMoving] = useState<ProductionSummary | null>(null)
  const project = data.resource
  const venture = data.trail.find((item) => item.type === "venture")
  const editableProject = {
    id: project.id,
    public_id: project.public_id,
    key: project.key,
    type: "project" as const,
    name: project.name,
    description: project.description,
    cover_image: (typeof project.cover_image === "string" ? project.cover_image : "") || project.icon || "",
    metrics: {
      production_count: data.metrics.production_count,
      part_count: data.metrics.part_count,
      duration_ms: data.metrics.duration_ms,
      total_cost: data.metrics.total_cost,
      current_sequence_cost: data.metrics.current_sequence_cost,
    },
    updated_at: project.updated_at,
  }
  const parent = { id: project.id, type: "project" as const, name: project.name }
  return <main className="work-page">
    <WorkPageHeader kind="Project" name={project.name} description={project.description} trail={data.trail} metrics={data.metrics} icon={editableProject.cover_image} actions={<ProjectSettingsDialog project={editableProject} venture={venture} onUpdated={refresh} onArchived={() => window.location.assign(venture ? `${audioStudioBase}/ventures/${venture.public_id}` : `${audioStudioBase}/`)} />} />
    <div className="work-content">
      <div className="project-structure-note"><strong>Inside this Project</strong><span>Use a Series for a related collection. Create a standalone Production when it does not belong to one.</span></div>
      <WorkSection title="Series" description="Optional collections that group related Productions." action={<Button variant="outline" onClick={() => setCreating("series")}><Plus /> New Series</Button>}>
        {data.series.length ? <div className="series-card-grid">{data.series.map((series) => <SeriesCard key={series.id} series={series} />)}</div> : <div className="work-empty compact"><Layers3 /><h3>No Series</h3><Button variant="outline" onClick={() => setCreating("series")}><Plus /> New Series</Button></div>}
      </WorkSection>
      <WorkSection title="Standalone Productions" description="Productions in this Project that are not assigned to a Series." action={<Button onClick={() => setCreating("production")}><Plus /> New Production</Button>}>
        {data.standalone_productions.length ? <div className="production-summary-list">{data.standalone_productions.map((production) => <ProductionRow production={production} key={production.id} menu={<ProductionMenu label={`Actions for ${production.name}`}><DropdownMenuItem disabled={!data.series.length} onSelect={() => setMoving(production)}><Layers3 /> Add to Series</DropdownMenuItem></ProductionMenu>} />)}</div> : <div className="work-empty compact"><FileAudio2 /><h3>No Productions</h3><Button onClick={() => setCreating("production")}><Plus /> New Production</Button></div>}
      </WorkSection>
    </div>
    {creating && <CreateResourceDialog kind={creating} parent={parent} open onOpenChange={(open) => { if (!open) setCreating(null) }} onCreated={refresh} />}
    <MoveProductionDialog production={moving} data={data} open={Boolean(moving)} onOpenChange={(open) => { if (!open) setMoving(null) }} refresh={refresh} />
  </main>
}
