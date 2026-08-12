import { useCallback, useEffect, useRef, useState } from "react"

import { jobObserver } from "@/lib/job-observer"
import { studioApi } from "@/lib/api"
import type { DurableJob, GenerateResult, RenderTask } from "@/types/domain"

export type RenderTaskDraft = Omit<RenderTask, "id" | "jobId" | "status" | "startedAt" | "error" | "detail">

export function useRenderTasks(
  executor: (task: RenderTaskDraft) => Promise<DurableJob<GenerateResult>>,
  onSuccess: (task: RenderTask, result: GenerateResult) => Promise<unknown>,
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
        needsConfirmation: Boolean(job.result?.needs_confirmation),
        requiresReview: Boolean(job.result?.requires_review || job.result?.ambiguous),
        estimate: Number(job.result?.estimate || job.result?.estimated_cost || 0),
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
      mode: draft.mode === "new" && job.part_id ? "pending" : draft.mode,
      id: job.id,
      jobId: job.id,
      status: job.status,
      detail: job.detail,
      error: job.error || undefined,
      needsConfirmation: Boolean(job.result?.needs_confirmation),
      requiresReview: Boolean(job.result?.requires_review || job.result?.ambiguous),
      estimate: Number(job.result?.estimate || job.result?.estimated_cost || 0),
      targetPartId: job.part_id || draft.targetPartId,
      startedAt: job.created_at ? new Date(job.created_at).getTime() : Date.now(),
    }
    if (mounted.current) setTasks((current) => [...current, task])
    track(task)
    return job
  }, [executor, track])

  const recover = useCallback((task: RenderTask, job: DurableJob<GenerateResult>) => {
    if (subscriptions.current.has(task.jobId)) return
    jobObserver.register(job, studioApi.job<GenerateResult>)
    setTasks((current) => current.some((item) => item.jobId === task.jobId)
      ? current : [...current, task])
    track(task)
  }, [track])

  const retry = useCallback((task: RenderTask) => {
    const { id: _id, jobId: _jobId, status: _status, startedAt: _startedAt, error: _error, detail: _detail, ...draft } = task
    void enqueue(draft).then(() => {
      if (mounted.current) setTasks((current) => current.filter((item) => item.jobId !== task.jobId))
    }).catch(() => undefined)
  }, [enqueue])
  const confirm = useCallback(async (task: RenderTask) => {
    const job = await studioApi.confirmJob<GenerateResult>(task.jobId)
    const continued: RenderTask = {
      ...task,
      id: job.id,
      jobId: job.id,
      status: job.status,
      detail: job.detail,
      error: job.error || undefined,
      needsConfirmation: Boolean(job.result?.needs_confirmation),
      requiresReview: Boolean(job.result?.requires_review || job.result?.ambiguous),
      estimate: Number(job.result?.estimate || job.result?.estimated_cost || 0),
      startedAt: job.created_at ? new Date(job.created_at).getTime() : Date.now(),
    }
    if (mounted.current) setTasks((current) => [
      ...current.filter((item) => (
        item.jobId !== task.jobId && item.jobId !== job.id
      )),
      continued,
    ])
    track(continued)
    return job
  }, [track])
  const dismiss = useCallback((id: string) => setTasks((current) => current.filter((task) => task.jobId !== id)), [])

  return { tasks, enqueue, recover, retry, confirm, dismiss }
}
