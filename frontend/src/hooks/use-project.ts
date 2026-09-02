import { useCallback, useEffect, useState } from "react"

import { originsApi } from "@/lib/api"
import type { LoadState, Project, SoundScene, VisualScene } from "@/types/domain"

export function useProject(id: number | null) {
  const [project, setProject] = useState<LoadState<Project>>({ status: "loading" })
  const [soundScene, setSoundScene] = useState<LoadState<SoundScene>>({ status: "loading" })
  const [visualScene, setVisualScene] = useState<LoadState<VisualScene>>({ status: "loading" })

  const refresh = useCallback(async () => {
    if (!id) {
      setProject({ status: "error", error: "No Project is selected." })
      return
    }
    setProject((state) => ({ status: "loading", data: state.data }))
    setSoundScene((state) => ({ status: "loading", data: state.data }))
    setVisualScene((state) => ({ status: "loading", data: state.data }))
    const results = await Promise.allSettled([
      originsApi.projectEditor(id),
      originsApi.soundScene(id),
      originsApi.visualScene(id),
    ])
    const [projectResult, soundSceneResult, visualSceneResult] = results
    if (projectResult.status === "fulfilled") {
      setProject({ status: "ready", data: projectResult.value })
    } else {
      setProject((state) => ({ status: "error", data: state.data, error: projectResult.reason?.message || "Unable to load Project." }))
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

  return { project, soundScene, visualScene, refresh }
}
