import { useCallback, useEffect, useMemo, useState } from "react"

import { studioApi } from "@/lib/api"
import type { CreationActionSummary, LoadState, SpaceOverview, SpaceSummary } from "@/types/domain"

const SPACE_STORAGE_KEY = "auvi.current-space"

function defaultSpace(spaces: SpaceSummary[]) {
  const stored = Number(window.localStorage.getItem(SPACE_STORAGE_KEY) || 0)
  const remembered = spaces.find((space) => space.id === stored)
  if (remembered) return remembered
  return [...spaces].sort((left, right) => {
    const leftUse = left.project_count * 4 + left.file_count * 2 + left.folder_count
    const rightUse = right.project_count * 4 + right.file_count * 2 + right.folder_count
    return rightUse - leftUse || right.updated_at.localeCompare(left.updated_at)
  })[0]
}

export function useSpaceHome() {
  const [spaces, setSpaces] = useState<LoadState<SpaceSummary[]>>({ status: "loading" })
  const [overview, setOverview] = useState<LoadState<SpaceOverview>>({ status: "loading" })
  const [actions, setActions] = useState<LoadState<CreationActionSummary[]>>({ status: "loading" })
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null)

  const loadSpaces = useCallback(async () => {
    setSpaces((current) => ({ status: "loading", data: current.data }))
    try {
      const nextSpaces = await studioApi.spaces()
      setSpaces({ status: "ready", data: nextSpaces })
      setSelectedSpaceId((current) => current && nextSpaces.some((space) => space.id === current)
        ? current
        : defaultSpace(nextSpaces)?.id || null)
    } catch (error) {
      setSpaces({ status: "error", error: error instanceof Error ? error.message : "Unable to load Spaces." })
    }
  }, [])

  const loadActions = useCallback(async () => {
    try {
      setActions({ status: "ready", data: await studioApi.creationActions() })
    } catch (error) {
      setActions({ status: "error", error: error instanceof Error ? error.message : "Unable to load Create actions." })
    }
  }, [])

  const loadOverview = useCallback(async (spaceId: number) => {
    setOverview((current) => ({ status: "loading", data: current.data?.space.id === spaceId ? current.data : undefined }))
    try {
      const data = await studioApi.space(spaceId)
      setOverview({ status: "ready", data })
    } catch (error) {
      setOverview({ status: "error", error: error instanceof Error ? error.message : "Unable to load this Space." })
    }
  }, [])

  useEffect(() => { void Promise.all([loadSpaces(), loadActions()]) }, [loadActions, loadSpaces])
  useEffect(() => {
    if (!selectedSpaceId) return
    window.localStorage.setItem(SPACE_STORAGE_KEY, String(selectedSpaceId))
    void loadOverview(selectedSpaceId)
  }, [loadOverview, selectedSpaceId])

  return useMemo(() => ({
    spaces, overview, actions, selectedSpaceId, setSelectedSpaceId,
    refresh: () => selectedSpaceId ? loadOverview(selectedSpaceId) : loadSpaces(),
    refreshSpaces: loadSpaces,
    refreshActions: loadActions,
  }), [actions, loadActions, loadOverview, loadSpaces, overview, selectedSpaceId, spaces])
}
