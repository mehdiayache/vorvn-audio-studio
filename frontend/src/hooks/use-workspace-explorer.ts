import { useCallback, useEffect, useMemo, useState } from "react"

import { originsApi } from "@/lib/api"
import {
  preferredWorkspace, rememberedWorkspaceId, rememberWorkspace, WORKSPACE_SELECTION_EVENT,
} from "@/features/workspace/workspace-selection"
import type { CreationActionSummary, LoadState, WorkspaceOverview, WorkspaceSummary } from "@/types/domain"

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
        : preferredWorkspace(nextWorkspaces)?.id || null)
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
    const syncSelection = (event: Event) => {
      const workspaceId = (event as CustomEvent<number>).detail || rememberedWorkspaceId()
      if (workspaceId) setSelectedWorkspaceId(workspaceId)
    }
    window.addEventListener(WORKSPACE_SELECTION_EVENT, syncSelection)
    window.addEventListener("storage", syncSelection)
    return () => {
      window.removeEventListener(WORKSPACE_SELECTION_EVENT, syncSelection)
      window.removeEventListener("storage", syncSelection)
    }
  }, [])
  useEffect(() => {
    if (!selectedWorkspaceId) return
    if (rememberedWorkspaceId() !== selectedWorkspaceId) rememberWorkspace(selectedWorkspaceId)
    void loadOverview(selectedWorkspaceId)
  }, [loadOverview, selectedWorkspaceId])

  return useMemo(() => ({
    workspaces, overview, actions, selectedWorkspaceId, setSelectedWorkspaceId,
    refresh: () => selectedWorkspaceId ? loadOverview(selectedWorkspaceId) : loadWorkspaces(),
    refreshWorkspaces: loadWorkspaces,
    refreshActions: loadActions,
  }), [actions, loadActions, loadOverview, loadWorkspaces, overview, selectedWorkspaceId, workspaces])
}
