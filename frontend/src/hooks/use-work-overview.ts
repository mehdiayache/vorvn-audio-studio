import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { LoadState, ProjectOverview, SeriesOverview, VentureOverview } from "@/types/domain"

type WorkOverview = VentureOverview | ProjectOverview | SeriesOverview
type WorkKind = "venture" | "project" | "series"

function load(kind: WorkKind, id: number) {
  if (kind === "venture") return studioApi.ventureOverview(id)
  if (kind === "project") return studioApi.projectOverview(id)
  return studioApi.seriesOverview(id)
}

export function useWorkOverview<T extends WorkOverview>(kind: WorkKind, id: number) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" })
  const refresh = useCallback(async () => {
    setState((current) => ({ status: "loading", data: current.data }))
    try {
      setState({ status: "ready", data: await load(kind, id) as T })
    } catch (error) {
      setState({ status: "error", error: error instanceof Error ? error.message : `Unable to load this ${kind}.` })
    }
  }, [id, kind])
  useEffect(() => { void refresh() }, [refresh])
  return { ...state, refresh }
}

export const useVentureOverview = (id: number) => useWorkOverview<VentureOverview>("venture", id)
export const useProjectOverview = (id: number) => useWorkOverview<ProjectOverview>("project", id)
export const useSeriesOverview = (id: number) => useWorkOverview<SeriesOverview>("series", id)
