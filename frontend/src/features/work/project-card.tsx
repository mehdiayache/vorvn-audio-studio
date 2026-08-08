import { FolderKanban } from "lucide-react"

import { formatDuration, formatUpdated } from "@/lib/format"
import { resourceHref } from "@/lib/links"
import type { ProjectSummary, TrailItem } from "@/types/domain"
import { ProjectSettingsDialog } from "./project-settings-dialog"

export function ProjectCard({ project, venture, onUpdated }: { project: ProjectSummary; venture?: TrailItem; onUpdated: () => void }) {
  const updated = formatUpdated(project.updated_at)
  const productions = `${project.metrics.production_count} production${project.metrics.production_count === 1 ? "" : "s"}`
  return <article className={`project-card${project.cover_image ? " has-cover" : " no-cover"}`}>
    {project.cover_image ? <img className="project-card-image" src={project.cover_image} alt="" /> : <span className="project-card-fallback"><FolderKanban /><small>No cover image</small></span>}
    <a className="project-card-link" href={resourceHref("project", project.id)} aria-label={`Open Project ${project.name}`} />
    <div className="project-card-top"><small>Project</small><ProjectSettingsDialog project={project} venture={venture} onUpdated={onUpdated} /></div>
    <div className="project-card-content">
      <h3>{project.name}</h3>
      {project.description && <p>{project.description}</p>}
      <footer><span>{productions}</span><span>{formatDuration(project.metrics.duration_ms / 1000)}</span>{updated && <span>{updated}</span>}</footer>
    </div>
  </article>
}

export function ProjectCardGrid({ projects, venture, onUpdated }: { projects: ProjectSummary[]; venture?: TrailItem; onUpdated: () => void }) {
  return <div className="project-card-grid">{projects.map((project) => <ProjectCard project={project} venture={venture} onUpdated={onUpdated} key={project.id} />)}</div>
}
