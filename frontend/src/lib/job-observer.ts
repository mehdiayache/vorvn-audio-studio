import { ApiError } from "@/lib/api-error"

export type ObservedJob = { status: string; result?: unknown; error?: string | null }

const terminalSuccess = new Set(["ok", "warning", "blocked"])
const terminalFailure = new Set(["failed", "lost", "cancelled"])
const active = new Map<string, Promise<unknown>>()
const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

async function poll<T>(jobId: string, read: (id: string) => Promise<ObservedJob>): Promise<T> {
  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    const job = await read(jobId)
    if (terminalSuccess.has(job.status)) return job.result as T
    if (terminalFailure.has(job.status)) throw new ApiError(job.error || `Job ${job.status}.`, 409)
    await delay(1000)
  }
  throw new ApiError("The Job is still running. Check Activity for its current state.", 408)
}

/** One durable observer per Job, shared across components and route changes. */
export function observeJob<T>(jobId: string, read: (id: string) => Promise<ObservedJob>): Promise<T> {
  const existing = active.get(jobId)
  if (existing) return existing as Promise<T>
  const observation = poll<T>(jobId, read).finally(() => active.delete(jobId))
  active.set(jobId, observation)
  return observation
}

export function observedJobCount() { return active.size }
