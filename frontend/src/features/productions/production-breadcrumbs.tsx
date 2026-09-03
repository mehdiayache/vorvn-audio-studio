import { ShellBreadcrumbs, type ShellBreadcrumbItem } from "@/components/shell-breadcrumbs"
import type { Production, ProjectDetail, WorkspaceFolder } from "@/types/domain"

function folderPath(project: ProjectDetail, folderId: number | null | undefined) {
  if (!folderId) return []
  const byId = new Map(project.folders.map((folder) => [folder.id, folder]))
  const path: WorkspaceFolder[] = []
  const visited = new Set<number>()
  let folder = byId.get(folderId)
  while (folder && !visited.has(folder.id)) {
    if (folder.workspace_id !== project.workspace_id || folder.project_id !== project.id) return []
    visited.add(folder.id)
    path.unshift(folder)
    folder = folder.parent_id === null ? undefined : byId.get(folder.parent_id)
  }
  return path
}

function projectLocation(project: ProjectDetail, folder?: WorkspaceFolder) {
  const destination = `/origins/projects/${project.public_id}`
  return folder ? `${destination}?folder=${encodeURIComponent(folder.public_id)}` : destination
}

export function ProductionBreadcrumbs({ production, project }: {
  production: Production
  project: ProjectDetail | null
}) {
  if (!production.project_id) {
    return <ShellBreadcrumbs items={[
      { label: "Productions", href: "/origins/productions" },
      { label: production.name },
    ]} />
  }

  const folders = project && project.id === production.project_id
    ? folderPath(project, production.folder_id)
    : []
  const currentFolder = folders.at(-1)
  const projectIdentifier = project?.public_id || String(production.project_id)
  const projectDestination = project
    ? projectLocation(project, currentFolder)
    : `/origins/projects/${projectIdentifier}`
  const items: ShellBreadcrumbItem[] = [
    { label: project?.name || "Project", href: projectDestination },
    ...folders.map((folder) => ({
      label: folder.name,
      href: project ? projectLocation(project, folder) : undefined,
    })),
    { label: production.name },
  ]
  return <ShellBreadcrumbs items={items} />
}
