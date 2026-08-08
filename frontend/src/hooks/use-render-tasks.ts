import { useCallback, useState } from "react"

import type { GenerateResult, RenderTask } from "@/types/domain"

export function useRenderTasks(executor: (task: RenderTask) => Promise<GenerateResult>) {
  const [tasks, setTasks] = useState<RenderTask[]>([])

  const run = useCallback(async (task: RenderTask) => {
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "generating", error: undefined, startedAt: Date.now() } : item))
    try {
      const result = await executor(task)
      if (!result.needs_confirmation) setTasks((current) => current.filter((item) => item.id !== task.id))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "The provider could not generate this audio."
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "failed", error: message } : item))
      throw error
    }
  }, [executor])

  const enqueue = useCallback((task: RenderTask) => {
    setTasks((current) => [...current, task])
    return run(task)
  }, [run])
  const retry = useCallback((task: RenderTask) => { void run(task).catch(() => undefined) }, [run])
  const dismiss = useCallback((id: string) => setTasks((current) => current.filter((task) => task.id !== id)), [])

  return { tasks, enqueue, retry, dismiss }
}
