import { useCallback, useEffect, useMemo, useState } from "react"

import { originsApi } from "@/lib/api"
import type { CreationActionSummary, LoadState, WorkspaceOverview, WorkspaceSummary } from "@/types/domain"

const WORKSPACE_STORAGE_KEY = "origins.current-workspace"

function defaultWorkspace(workspaces: WorkspaceSummary[]) {
  const stored = Number(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || 0)
  const remembered = workspaces.find((workspace) => workspace.id === stored)
  if (remembered) return remembered
  return [...workspaces].sort((left, right) => {
    const leftUse = left.production_count * 4 + left.file_count * 2 + left.folder_count
    const rightUse = right.production_count * 4 + right.file_count * 2 + right.folder_count
    return rightUse - leftUse || right.updated_at.localeCompare(left.updated_at)
  })[0]
}

export function useWorkspaceExplorer() {
  const [workspaces, setWorkspaces] = useState<LoadState<WorkspaceSummary[]>>({ status: "loading" })
  const [overview, setOverview] = useState<LoadState<WorkspaceOverview>>({ status: "loading" })
  const [actions, setActions] = useState<LoadState<CreationActionSummary[]>>({ status: "loading" })
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null)

  const loadWorkspaces = useCallback(async () => {
    setWorkspaces((current) => ({ status: "loading", data: current.data }))
    try {
      const nextWorkspaces = await originsApi.workspaces()
      setWorkspaces({ status: "ready", data: nextWorkspaces })
      setSelectedWorkspaceId((current) => current && nextWorkspaces.some((workspace) => workspace.id === current)
        ? current
        : defaultWorkspace(nextWorkspaces)?.id || null)
    } catch (error) {
      setWorkspaces({ status: "error", error: error instanceof Error ? error.message : "Unable to load Workspaces." })
    }
  }, [])

  const loadActions = useCallback(async () => {
    try {
      setActions({ status: "ready", data: await originsApi.creationActions() })
    } catch (error) {
      setActions({ status: "error", error: error instanceof Error ? error.message : "Unable to load Create actions." })
    }
  }, [])

  const loadOverview = useCallback(async (workspaceId: number) => {
    setOverview((current) => ({ status: "loading", data: current.data?.workspace.id === workspaceId ? current.data : undefined }))
    try {
      const data = await originsApi.workspace(workspaceId)
      setOverview({ status: "ready", data })
    } catch (error) {
      setOverview({ status: "error", error: error instanceof Error ? error.message : "Unable to load this Workspace." })
    }
  }, [])

  useEffect(() => { void Promise.all([loadWorkspaces(), loadActions()]) }, [loadActions, loadWorkspaces])
  useEffect(() => {
    if (!selectedWorkspaceId) return
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, String(selectedWorkspaceId))
    void loadOverview(selectedWorkspaceId)
  }, [loadOverview, selectedWorkspaceId])

  return useMemo(() => ({
    workspaces, overview, actions, selectedWorkspaceId, setSelectedWorkspaceId,
    refresh: () => selectedWorkspaceId ? loadOverview(selectedWorkspaceId) : loadWorkspaces(),
    refreshWorkspaces: loadWorkspaces,
    refreshActions: loadActions,
  }), [actions, loadActions, loadOverview, loadWorkspaces, overview, selectedWorkspaceId, workspaces])
}
