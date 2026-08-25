import { ChevronDown, FileAudio2, Layers3, Plus, Rows3, Trash2, Unlink } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DeleteProductionDialog } from "@/components/delete-production-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { studioApi } from "@/lib/api"
import { audioStudioBase } from "@/lib/links"
import type { ProductionSummary, ProjectOverview } from "@/types/domain"
import { CreateResourceDialog, type CreateKind } from "./create-resource-dialog"
import { ProjectSettingsDialog } from "./project-settings-dialog"
import {
  DropdownMenuItem as ProductionMenuItem, NewResourceTile, ProductionMenu,
  ProductionRow, SeriesCard, WorkCollectionToolbar, WorkEmpty, WorkPageHeader,
  WorkSection, type WorkSort,
} from "./work-primitives"
import "./work.css"

function MoveProductionDialog({ production, data, open, onOpenChange, refresh }: { production: ProductionSummary | null; data: ProjectOverview; open: boolean; onOpenChange: (open: boolean) => void; refresh: () => void }) {
  const [saving, setSaving] = useState(false)
  async function move(seriesId: number | null) {
    if (!production) return
    setSaving(true)
    try {
      await studioApi.moveProduction(production.id, seriesId)
      onOpenChange(false); refresh()
      toast.success(seriesId === null ? `${production.name} now lives directly in this Project.` : `Moved ${production.name}.`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to move this Production.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Move Production</DialogTitle><DialogDescription>Choose where {production?.name || "this Production"} belongs inside {data.resource.name}.</DialogDescription></DialogHeader><div className="move-series-list"><Button variant="outline" disabled={saving || production?.series_id === null} onClick={() => void move(null)}><Unlink /><span><b>Directly in Project</b><small>Keep it outside every Series.</small></span></Button>{data.series.map((series) => <Button key={series.id} variant="outline" disabled={saving || production?.series_id === series.id} onClick={() => void move(series.id)}><Layers3 /><span><b>{series.name}</b><small>{series.metrics.production_count} Productions</small></span></Button>)}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button></DialogFooter></DialogContent></Dialog>
}

function RowWithMove({ production, onMove, onDelete }: { production: ProductionSummary; onMove: (production: ProductionSummary) => void; onDelete: (production: ProductionSummary) => void }) {
  return <ProductionRow production={production} menu={<ProductionMenu label={`Actions for ${production.name}`}><ProductionMenuItem onSelect={() => onMove(production)}><Rows3 /> Move Production</ProductionMenuItem><ProductionMenuItem variant="destructive" onSelect={() => onDelete(production)}><Trash2 /> Delete Production permanently</ProductionMenuItem></ProductionMenu>} />
}

export function ProjectPage({ data, refresh }: { data: ProjectOverview; refresh: () => void }) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState<CreateKind | null>(null)
  const [moving, setMoving] = useState<ProductionSummary | null>(null)
  const [deleting, setDeleting] = useState<ProductionSummary | null>(null)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<WorkSort>("updated")
  const project = data.resource
  const venture = data.trail.find((item) => item.type === "venture")
  const editableProject = { id: project.id, public_id: project.public_id, key: project.key, type: "project" as const, name: project.name, description: project.description, cover_image: (typeof project.cover_image === "string" ? project.cover_image : "") || project.icon || "", metrics: { production_count: data.metrics.production_count, part_count: data.metrics.part_count, duration_ms: data.metrics.duration_ms, total_cost: data.metrics.total_cost, current_sequence_cost: data.metrics.current_sequence_cost }, updated_at: project.updated_at }
  const parent = { id: project.id, type: "project" as const, name: project.name }
  const needle = query.trim().toLowerCase()
  const productions = useMemo(() => data.standalone_productions.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(needle)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "duration" ? b.duration_ms - a.duration_ms : String(b.updated_at || "").localeCompare(String(a.updated_at || ""))), [data.standalone_productions, needle, sort])
  const series = useMemo(() => data.series.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(needle)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "duration" ? b.metrics.duration_ms - a.metrics.duration_ms : String(b.updated_at || "").localeCompare(String(a.updated_at || ""))), [data.series, needle, sort])
  const createMenu = <DropdownMenu><DropdownMenuTrigger asChild><Button><Plus /> Create <ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setCreating("production")}><FileAudio2 /> New Production</DropdownMenuItem><DropdownMenuItem onSelect={() => setCreating("series")}><Layers3 /> New Series</DropdownMenuItem></DropdownMenuContent></DropdownMenu>

  return <main className="work-page">
    <WorkPageHeader kind="Project" name={project.name} description={project.description} trail={data.trail} metrics={data.metrics} icon={editableProject.cover_image} actions={<><ProjectSettingsDialog project={editableProject} venture={venture} onUpdated={refresh} onArchived={() => navigate(venture ? `${audioStudioBase}/ventures/${venture.public_id}` : `${audioStudioBase}/`)} />{createMenu}</>} />
    <div className="work-content project-library-view">
      <WorkCollectionToolbar query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} placeholder="Find a Production or Series" resultCount={productions.length + series.length} />
      <WorkSection title="Productions" description="One-off and independent work, available immediately." count={data.standalone_productions.length} action={<Button size="sm" onClick={() => setCreating("production")}><Plus /> New Production</Button>}>
        {productions.length ? <div className="production-summary-list">{productions.map((production) => <RowWithMove production={production} onMove={setMoving} onDelete={setDeleting} key={production.id} />)}</div> : <WorkEmpty compact icon={<FileAudio2 />} title={needle ? "No matching Productions" : "No direct Productions"} description={needle ? "Try another search." : "Create a one-off Production, or work inside a Series below."} />}
      </WorkSection>
      <WorkSection title="Series" description="Recurring formats, episodes and editorial collections." count={data.series.length} action={<Button size="sm" variant="outline" onClick={() => setCreating("series")}><Plus /> New Series</Button>}>
        {series.length ? <div className="series-card-grid">{series.map((item) => <SeriesCard series={item} key={item.id} />)}<NewResourceTile label="New Series" description="Create a recurring editorial collection." onClick={() => setCreating("series")} /></div> : <WorkEmpty compact icon={<Layers3 />} title={needle ? "No matching Series" : "No Series yet"} description={needle ? "Try another search." : "Create one when this Project becomes a recurring format."} />}
      </WorkSection>
    </div>
    {creating && <CreateResourceDialog kind={creating} parent={parent} productionParents={creating === "production" ? [parent, ...data.series.map((item) => ({ id: item.id, type: "series" as const, name: item.name }))] : undefined} open onOpenChange={(open) => { if (!open) setCreating(null) }} onCreated={refresh} />}
    <MoveProductionDialog production={moving} data={data} open={Boolean(moving)} onOpenChange={(open) => { if (!open) setMoving(null) }} refresh={refresh} />
    <DeleteProductionDialog production={deleting} open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }} onDeleted={() => { setDeleting(null); refresh() }} />
  </main>
}
