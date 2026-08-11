import { useCallback, useEffect, useRef, useState } from "react"

import { jobObserver } from "@/lib/job-observer"
import type { DurableJob, GenerateResult, RenderTask } from "@/types/domain"

export type RenderTaskDraft = Omit<RenderTask, "id" | "jobId" | "status" | "startedAt" | "error" | "detail">

export function useRenderTasks(
  executor: (task: RenderTaskDraft) => Promise<DurableJob<GenerateResult>>,
  onSuccess: (task: RenderTask, result: GenerateResult) => Promise<void>,
) {
  const [tasks, setTasks] = useState<RenderTask[]>([])
  const mounted = useRef(true)
  const subscriptions = useRef(new Map<string, () => void>())

  useEffect(() => () => {
    mounted.current = false
    for (const unsubscribe of subscriptions.current.values()) unsubscribe()
    subscriptions.current.clear()
  }, [])

  const track = useCallback((task: RenderTask) => {
    const sync = () => {
      const job = jobObserver.getSnapshot<GenerateResult>(task.jobId)
      if (!job || !mounted.current) return
      setTasks((current) => current.map((item) => item.jobId === task.jobId ? {
        ...item,
        status: job.status,
        detail: job.detail,
        error: job.error || undefined,
      } : item))
    }
    subscriptions.current.get(task.jobId)?.()
    subscriptions.current.set(task.jobId, jobObserver.subscribe(task.jobId, sync))
    sync()
    void jobObserver.completion<GenerateResult>(task.jobId)
      .then(async (result) => {
        if (!mounted.current) return
        const snapshot = jobObserver.getSnapshot<GenerateResult>(task.jobId)
        if (snapshot?.status === "blocked") return
        await onSuccess(task, result)
        if (mounted.current) setTasks((current) => current.filter((item) => item.jobId !== task.jobId))
      })
      .catch((error) => {
        if (!mounted.current) return
        sync()
        setTasks((current) => current.map((item) => item.jobId === task.jobId ? {
          ...item,
          error: error instanceof Error ? error.message : "The provider could not generate this audio.",
        } : item))
      })
      .finally(() => {
        subscriptions.current.get(task.jobId)?.()
        subscriptions.current.delete(task.jobId)
      })
  }, [onSuccess])

  const enqueue = useCallback(async (draft: RenderTaskDraft) => {
    const job = await executor(draft)
    const task: RenderTask = {
      ...draft,
      id: job.id,
      jobId: job.id,
      status: job.status,
      detail: job.detail,
      error: job.error || undefined,
      startedAt: Date.now(),
    }
    if (mounted.current) setTasks((current) => [...current, task])
    track(task)
    return job
  }, [executor, track])

  const retry = useCallback((task: RenderTask) => {
    const { id: _id, jobId: _jobId, status: _status, startedAt: _startedAt, error: _error, detail: _detail, ...draft } = task
    void enqueue(draft).then(() => {
      if (mounted.current) setTasks((current) => current.filter((item) => item.jobId !== task.jobId))
    }).catch(() => undefined)
  }, [enqueue])
  const dismiss = useCallback((id: string) => setTasks((current) => current.filter((task) => task.jobId !== id)), [])

  return { tasks, enqueue, retry, dismiss }
}
