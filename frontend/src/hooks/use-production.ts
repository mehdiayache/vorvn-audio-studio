import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { HierarchyNode, LoadState, Production, SoundScene } from "@/types/domain"

export function useProduction(id: number | null) {
  const [production, setProduction] = useState<LoadState<Production>>({ status: "loading" })
  const [tree, setTree] = useState<LoadState<HierarchyNode[]>>({ status: "loading" })
  const [soundScene, setSoundScene] = useState<LoadState<SoundScene>>({ status: "loading" })

  const refresh = useCallback(async () => {
    if (!id) {
      setProduction({ status: "error", error: "No Production is selected." })
      return
    }
    setProduction((state) => ({ status: "loading", data: state.data }))
    setSoundScene((state) => ({ status: "loading", data: state.data }))
    const results = await Promise.allSettled([
      studioApi.production(id),
      studioApi.projects(),
      studioApi.soundScene(id),
    ])
    const [productionResult, treeResult, soundSceneResult] = results
    if (productionResult.status === "fulfilled") {
      setProduction({ status: "ready", data: productionResult.value })
    } else {
      setProduction((state) => ({ status: "error", data: state.data, error: productionResult.reason?.message || "Unable to load Production." }))
    }
    if (treeResult.status === "fulfilled") {
      setTree({ status: "ready", data: treeResult.value })
    } else {
      setTree((state) => ({ status: "error", data: state.data, error: treeResult.reason?.message || "Unable to load Projects." }))
    }
    if (soundSceneResult.status === "fulfilled") {
      setSoundScene({ status: "ready", data: soundSceneResult.value })
    } else {
      setSoundScene((state) => ({ status: "error", data: state.data, error: soundSceneResult.reason?.message || "Unable to load Timeline." }))
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { production, tree, soundScene, refresh }
}
