import type { WorkspaceSummary } from "@/types/domain"

export const WORKSPACE_STORAGE_KEY = "origins.current-workspace"
export const WORKSPACE_SELECTION_EVENT = "origins:workspace-selection"

export function rememberWorkspace(workspaceId: number) {
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, String(workspaceId))
  window.dispatchEvent(new CustomEvent<number>(WORKSPACE_SELECTION_EVENT, { detail: workspaceId }))
}

export function rememberedWorkspaceId() {
  return Number(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || 0)
}

export function preferredWorkspace(workspaces: WorkspaceSummary[]) {
  const remembered = workspaces.find((workspace) => workspace.id === rememberedWorkspaceId())
  if (remembered) return remembered
  return [...workspaces].sort((left, right) => {
    const leftUse = left.production_count * 4 + left.project_count * 3 + left.file_count * 2 + left.folder_count
    const rightUse = right.production_count * 4 + right.project_count * 3 + right.file_count * 2 + right.folder_count
    return rightUse - leftUse || right.updated_at.localeCompare(left.updated_at)
  })[0]
}
