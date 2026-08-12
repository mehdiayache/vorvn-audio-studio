import {
  ChevronDown, FileAudio2, Layers3, Plus, Rows3, Unlink,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { studioApi } from "@/lib/api"
import { audioStudioBase, resourceHref } from "@/lib/links"
import type { ProductionSummary, ProjectOverview } from "@/types/domain"
import { CreateResourceDialog, type CreateKind } from "./create-resource-dialog"
import { ProjectSettingsDialog } from "./project-settings-dialog"
import {
  DropdownMenuItem as ProductionMenuItem, ProductionMenu, ProductionRow,
  WorkPageHeader,
} from "./work-primitives"
import "./work.css"

type ProjectSeries = ProjectOverview["series"][number]

function MoveProductionDialog({
  production,
  data,
  open,
  onOpenChange,
  refresh,
}: {
  production: ProductionSummary | null
  data: ProjectOverview
  open: boolean
  onOpenChange: (open: boolean) => void
  refresh: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function move(seriesId: number | null) {
    if (!production) return
    setSaving(true)
    try {
      await studioApi.moveProduction(production.id, seriesId)
      onOpenChange(false)
      refresh()
      toast.success(seriesId === null
        ? `${production.name} is now standalone.`
        : `Moved ${production.name}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to move this Production.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Production</DialogTitle>
          <DialogDescription>
            Choose where {production?.name || "this Production"} belongs inside {data.resource.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="move-series-list">
          <Button
            variant="outline"
            disabled={saving || production?.series_id === null}
            onClick={() => void move(null)}
          >
            <Unlink />
            <span><b>Standalone</b><small>Keep it outside every Series.</small></span>
          </Button>
          {data.series.map((series) => (
            <Button
              key={series.id}
              variant="outline"
              disabled={saving || production?.series_id === series.id}
              onClick={() => void move(series.id)}
            >
              <Layers3 />
              <span>
                <b>{series.name}</b>
                <small>{series.metrics.production_count} Productions</small>
              </span>
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RowWithMove({
  production,
  onMove,
}: {
  production: ProductionSummary
  onMove: (production: ProductionSummary) => void
}) {
  return (
    <ProductionRow
      production={production}
      menu={(
        <ProductionMenu label={`Actions for ${production.name}`}>
          <ProductionMenuItem onSelect={() => onMove(production)}>
            <Rows3 /> Move Production
          </ProductionMenuItem>
        </ProductionMenu>
      )}
    />
  )
}

function SeriesGroup({
  series,
  onMove,
}: {
  series: ProjectSeries
  onMove: (production: ProductionSummary) => void
}) {
  const productions = series.productions || []
  return (
    <details className="project-series-group" open>
      <summary>
        <span className="series-group-toggle"><ChevronDown /></span>
        <Link to={resourceHref("series", series.public_id)}>
          <span className="series-group-label">Series</span>
          <strong>{series.name}</strong>
          <small>
            {series.metrics.production_count} Production
            {series.metrics.production_count === 1 ? "" : "s"}
          </small>
        </Link>
      </summary>
      <div className="series-group-productions">
        {productions.length
          ? productions.map((production) => (
            <RowWithMove production={production} onMove={onMove} key={production.id} />
          ))
          : (
            <div className="project-group-empty">
              <FileAudio2 />
              <span>No Productions in this Series.</span>
            </div>
          )}
      </div>
    </details>
  )
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
  const empty = !data.series.length && !data.standalone_productions.length

  const createMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button><Plus /> Create <ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setCreating("production")}>
          <FileAudio2 /> New Production
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setCreating("series")}>
          <Layers3 /> New Series
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <main className="work-page">
      <WorkPageHeader
        kind="Project"
        name={project.name}
        description={project.description}
        trail={data.trail}
        metrics={data.metrics}
        icon={editableProject.cover_image}
        actions={(
          <>
            <ProjectSettingsDialog
              project={editableProject}
              venture={venture}
              onUpdated={refresh}
              onArchived={() => window.location.assign(
                venture
                  ? `${audioStudioBase}/ventures/${venture.public_id}`
                  : `${audioStudioBase}/`,
              )}
            />
            {createMenu}
          </>
        )}
      />
      <div className="work-content project-editorial-view">
        {empty ? (
          <div className="work-empty">
            <FileAudio2 />
            <h2>Start this Project</h2>
            <p>Create a Production directly, or create a Series for recurring work.</p>
            {createMenu}
          </div>
        ) : (
          <>
            {data.series.map((series) => (
              <SeriesGroup series={series} onMove={setMoving} key={series.id} />
            ))}
            {data.standalone_productions.length > 0 && (
              <section className="project-standalone-group">
                <header>
                  <span className="series-group-label">Project</span>
                  <h2>Standalone</h2>
                  <p>Productions that do not belong to a Series.</p>
                </header>
                <div className="series-group-productions">
                  {data.standalone_productions.map((production) => (
                    <RowWithMove production={production} onMove={setMoving} key={production.id} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {creating && (
        <CreateResourceDialog
          kind={creating}
          parent={parent}
          open
          onOpenChange={(open) => { if (!open) setCreating(null) }}
          onCreated={refresh}
        />
      )}
      <MoveProductionDialog
        production={moving}
        data={data}
        open={Boolean(moving)}
        onOpenChange={(open) => { if (!open) setMoving(null) }}
        refresh={refresh}
      />
    </main>
  )
}
