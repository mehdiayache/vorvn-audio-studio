import { ShellBreadcrumbs, type ShellBreadcrumbItem } from "@/components/shell-breadcrumbs"
import type { Production, WorkspaceFolder, WorkspaceProject } from "@/types/domain"

function folderPath(production: Production, folders: WorkspaceFolder[]) {
  const folderId = production.folder_id
  if (!folderId) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: WorkspaceFolder[] = []
  const visited = new Set<number>()
  let folder = byId.get(folderId)
  while (folder && !visited.has(folder.id)) {
    if (folder.workspace_id !== production.workspace_id || folder.project_id !== production.project_id) return []
    visited.add(folder.id)
    path.unshift(folder)
    folder = folder.parent_id === null ? undefined : byId.get(folder.parent_id)
  }
  return path
}

function projectLocation(projectIdentifier: string, folder?: WorkspaceFolder) {
  const destination = `/origins/projects/${projectIdentifier}`
  return folder ? `${destination}?folder=${encodeURIComponent(folder.public_id)}` : destination
}

export function ProductionBreadcrumbs({ production, project, folders }: {
  production: Production
  project: WorkspaceProject | null
  folders: WorkspaceFolder[]
}) {
  if (!production.project_id) {
    return <ShellBreadcrumbs items={[
      { label: "Productions", href: "/origins/productions" },
      { label: production.name },
    ]} />
  }

  const matchingProject = project?.id === production.project_id
    && project.workspace_id === production.workspace_id ? project : null
  const path = folderPath(production, folders)
  const currentFolder = path.at(-1)
  const projectIdentifier = matchingProject?.public_id || String(production.project_id)
  const projectDestination = projectLocation(projectIdentifier, currentFolder)
  const items: ShellBreadcrumbItem[] = [
    { label: matchingProject?.name || "Project", href: projectDestination },
    ...path.map((folder) => ({
      label: folder.name,
      href: projectLocation(projectIdentifier, folder),
    })),
    { label: production.name },
  ]
  return <ShellBreadcrumbs items={items} />
}
