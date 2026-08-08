import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { HierarchyNode, LoadState } from "@/types/domain"

export function useHierarchy() {
  const [state, setState] = useState<LoadState<HierarchyNode[]>>({ status: "loading" })
  const refresh = useCallback(async () => {
    setState((current) => ({ status: "loading", data: current.data }))
    try {
      setState({ status: "ready", data: await studioApi.projects() })
    } catch (error) {
      setState({ status: "error", error: error instanceof Error ? error.message : "Unable to load the Studio hierarchy." })
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { ...state, refresh }
}
