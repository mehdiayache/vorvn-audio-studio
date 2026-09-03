import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ChevronRight, Clapperboard, FolderKanban, Plus, Unlink } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"
import { formatUpdated } from "@/lib/format"
import type { ProjectDetail, ProjectProductionSummary, WorkspaceOverview, WorkspaceProduction } from "@/types/domain"
import "./project-page.css"

function ProductionRow({ production, onDetach }: {
  production: ProjectProductionSummary
  onDetach: (production: ProjectProductionSummary) => void
}) {
  return <article className="project-production-row">
    <span className="project-production-icon"><Clapperboard /></span>
    <span className="project-production-copy"><b>{production.name}</b><small>Audiovisual Production</small></span>
    <span className="project-production-updated">{formatUpdated(production.updated_at) || "Recently"}</span>
    <OperatorIconButton label={`Remove ${production.name} from Project`} detail="The Production and all of its creative state remain intact." variant="ghost" size="icon-sm" onClick={() => onDetach(production)}><Unlink /></OperatorIconButton>
    <Button asChild variant="ghost" size="icon-sm" aria-label={`Open Production ${production.name}`}><Link to={`/origins/productions/audiovisual/${production.public_id}`}><ChevronRight /></Link></Button>
  </article>
}

export function ProjectPage() {
  const { identifier = "" } = useParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceOverview | null>(null)
  const [error, setError] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const action = useAsyncAction<string>()

  const load = useCallback(async () => {
    setError("")
    try {
      const nextProject = await originsApi.project(identifier)
      const nextWorkspace = await originsApi.workspace(nextProject.workspace_id)
      setProject(nextProject)
      setWorkspace(nextWorkspace)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open this Project.")
    }
  }, [identifier])

  useEffect(() => { void load() }, [load])

  const available = useMemo(() => (
    workspace?.productions.filter((production) => production.project_id === null) || []
  ), [workspace])

  async function setMembership(production: ProjectProductionSummary | WorkspaceProduction, projectId: number | null) {
    await action.run(`production-${production.id}`, async () => {
      try {
        await originsApi.updateProduction(production.id, { project_id: projectId })
        await load()
        toast.success(projectId ? "Production added to Project." : "Production removed from Project.")
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Project membership could not be changed.")
      }
    })
  }

  if (error && !project) return <ErrorState title="Project unavailable" message={error} retry={() => void load()} />
  if (!project || !workspace) return <PageLoading label="Opening Project" />

  const folder = workspace.folders.find((item) => item.id === project.folder_id)
  return <main className="project-page">
    <header className="project-page-header">
      <Button asChild variant="ghost" size="icon-sm" aria-label="Back to Projects"><Link to="/origins/projects"><ArrowLeft /></Link></Button>
      <span className="project-page-icon"><FolderKanban /></span>
      <div><small>Project</small><h1>{project.name}</h1><p>{project.description || "A human initiative grouping related Productions."}</p></div>
      <span className="project-page-location">{folder ? `Folder · ${folder.name}` : "Workspace root"}</span>
    </header>

    <section className="project-productions" aria-labelledby="project-productions-title">
      <header><div><h2 id="project-productions-title">Productions</h2><p>Creative working environments grouped in this Project.</p></div><ActionButton busyLabel="Opening…" onClick={() => setPickerOpen(true)}><Plus /> Add Production</ActionButton></header>
      <div className="project-production-list">
        {project.productions.map((production) => <ProductionRow key={production.id} production={production} onDetach={(item) => void setMembership(item, null)} />)}
        {!project.productions.length && <div className="project-empty"><Clapperboard /><b>No Productions in this Project</b><span>Add an existing Production without moving, copying or changing it.</span></div>}
      </div>
    </section>

    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent className="project-production-picker">
        <DialogHeader><DialogTitle>Add a Production</DialogTitle><DialogDescription>Membership groups work. Folder placement and Production state do not change.</DialogDescription></DialogHeader>
        <div className="project-production-options">
          {available.map((production) => <ActionButton key={production.id} variant="outline" busy={action.isPending(`production-${production.id}`)} busyLabel="Adding…" onClick={() => void setMembership(production, project.id)}><Clapperboard /><span><b>{production.name}</b><small>Audiovisual Production</small></span><Plus /></ActionButton>)}
          {!available.length && <p>Every Production in this Workspace already belongs to a Project.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </main>
}
