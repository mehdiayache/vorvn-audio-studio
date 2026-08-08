import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { HierarchyNode, LoadState, MusicBed, Production } from "@/types/domain"

export function useProduction(id: number | null) {
  const [production, setProduction] = useState<LoadState<Production>>({ status: "loading" })
  const [tree, setTree] = useState<LoadState<HierarchyNode[]>>({ status: "loading" })
  const [music, setMusic] = useState<LoadState<MusicBed>>({ status: "loading" })

  const refresh = useCallback(async () => {
    if (!id) {
      setProduction({ status: "error", error: "No Production is selected." })
      return
    }
    setProduction((state) => ({ status: "loading", data: state.data }))
    setMusic((state) => ({ status: "loading", data: state.data }))
    const results = await Promise.allSettled([
      studioApi.production(id),
      studioApi.projects(),
      studioApi.music(id),
    ])
    const [productionResult, treeResult, musicResult] = results
    if (productionResult.status === "fulfilled") {
      setProduction({ status: "ready", data: productionResult.value })
    } else {
      setProduction({ status: "error", error: productionResult.reason?.message || "Unable to load Production." })
    }
    if (treeResult.status === "fulfilled") {
      setTree({ status: "ready", data: treeResult.value })
    } else {
      setTree({ status: "error", error: treeResult.reason?.message || "Unable to load Projects." })
    }
    if (musicResult.status === "fulfilled") {
      setMusic({ status: "ready", data: musicResult.value })
    } else {
      setMusic({ status: "error", error: musicResult.reason?.message || "Unable to load music." })
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { production, tree, music, refresh }
}
