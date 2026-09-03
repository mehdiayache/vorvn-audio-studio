import { useCallback, useEffect, useState } from "react"

import { originsApi } from "@/lib/api"
import type { LoadState, Production, SoundScene, VisualScene } from "@/types/domain"

export function useProduction(id: number | null) {
  const [production, setProduction] = useState<LoadState<Production>>({ status: "loading" })
  const [soundScene, setSoundScene] = useState<LoadState<SoundScene>>({ status: "loading" })
  const [visualScene, setVisualScene] = useState<LoadState<VisualScene>>({ status: "loading" })

  const refresh = useCallback(async () => {
    if (!id) {
      setProduction({ status: "error", error: "No Production is selected." })
      return
    }
    setProduction((state) => ({ status: "loading", data: state.data }))
    setSoundScene((state) => ({ status: "loading", data: state.data }))
    setVisualScene((state) => ({ status: "loading", data: state.data }))
    const results = await Promise.allSettled([
      originsApi.productionEditor(id),
      originsApi.soundScene(id),
      originsApi.visualScene(id),
    ])
    const [productionResult, soundSceneResult, visualSceneResult] = results
    if (productionResult.status === "fulfilled") {
      setProduction({ status: "ready", data: productionResult.value })
    } else {
      setProduction((state) => ({ status: "error", data: state.data, error: productionResult.reason?.message || "Unable to load Production." }))
    }
    if (soundSceneResult.status === "fulfilled") {
      setSoundScene({ status: "ready", data: soundSceneResult.value })
    } else {
      setSoundScene((state) => ({ status: "error", data: state.data, error: soundSceneResult.reason?.message || "Unable to load Timeline." }))
    }
    if (visualSceneResult.status === "fulfilled") {
      setVisualScene({ status: "ready", data: visualSceneResult.value })
    } else {
      setVisualScene((state) => ({ status: "error", data: state.data, error: visualSceneResult.reason?.message || "Unable to load visuals." }))
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { production, soundScene, visualScene, refresh }
}
