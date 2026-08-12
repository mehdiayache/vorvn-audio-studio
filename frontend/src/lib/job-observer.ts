import { ApiError } from "@/lib/api-error"
import type { DurableJob } from "@/types/domain"

type JobReader = (id: string) => Promise<DurableJob<unknown>>
type Listener = () => void

const terminalSuccess = new Set(["ok", "warning", "blocked"])
const terminalFailure = new Set(["failed", "lost", "cancelled"])

type Entry = {
  snapshot: DurableJob<unknown>
  reader: JobReader
  listeners: Set<Listener>
  completion: Promise<unknown>
  resolve: (result: unknown) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof globalThis.setTimeout> | null
  active: boolean
}

class DurableJobObserver {
  private entries = new Map<string, Entry>()
  private discoveries = new Map<string, Promise<unknown>>()
  private pendingListeners = new Map<string, Set<Listener>>()

  register<T>(job: DurableJob<T>, reader: (id: string) => Promise<DurableJob<T>>) {
    const existing = this.entries.get(job.id)
    if (existing) {
      const wasTerminal = this.isTerminal(existing.snapshot.status)
      this.update(existing, job)
      if (wasTerminal && !this.isTerminal(job.status)) {
        let resolve: (result: unknown) => void = () => undefined
        let reject: (error: unknown) => void = () => undefined
        const completion = new Promise<unknown>((next, fail) => { resolve = next; reject = fail })
        void completion.catch(() => undefined)
        existing.reader = reader as JobReader
        existing.completion = completion
        existing.resolve = resolve
        existing.reject = reject
        existing.active = true
        this.schedule(job.id, existing, 0)
        return job
      }
      this.settleIfTerminal(existing)
      return job
    }
    let resolve: (result: unknown) => void = () => undefined
    let reject: (error: unknown) => void = () => undefined
    const completion = new Promise<unknown>((next, fail) => { resolve = next; reject = fail })
    // Completion is application state and may outlive every current React
    // consumer. Keep a rejection from becoming an unhandled browser promise.
    void completion.catch(() => undefined)
    const entry: Entry = {
      snapshot: job as DurableJob<unknown>,
      reader: reader as JobReader,
      listeners: this.pendingListeners.get(job.id) || new Set(), completion, resolve, reject,
      timer: null,
      active: true,
    }
    this.pendingListeners.delete(job.id)
    this.entries.set(job.id, entry)
    for (const listener of entry.listeners) listener()
    if (this.settleIfTerminal(entry)) return job
    this.schedule(job.id, entry, 0)
    return job
  }

  observe<T>(jobId: string, reader: (id: string) => Promise<DurableJob<T>>): Promise<T> {
    const existing = this.entries.get(jobId)
    if (existing) return existing.completion as Promise<T>
    const discovering = this.discoveries.get(jobId)
    if (discovering) return discovering as Promise<T>
    const observation = reader(jobId)
      .then((job) => {
        this.register(job, reader)
        return this.completion<T>(jobId)
      })
      .finally(() => this.discoveries.delete(jobId))
    this.discoveries.set(jobId, observation)
    return observation
  }

  completion<T>(jobId: string): Promise<T> {
    const entry = this.entries.get(jobId)
    if (!entry) return Promise.reject(new ApiError(`Job ${jobId} is not registered.`, 404))
    return entry.completion as Promise<T>
  }

  getSnapshot<T>(jobId: string | null): DurableJob<T> | null {
    if (!jobId) return null
    return (this.entries.get(jobId)?.snapshot as DurableJob<T> | undefined) || null
  }

  subscribe(jobId: string | null, listener: Listener) {
    if (!jobId) return () => undefined
    const entry = this.entries.get(jobId)
    if (!entry) {
      const listeners = this.pendingListeners.get(jobId) || new Set<Listener>()
      listeners.add(listener)
      this.pendingListeners.set(jobId, listeners)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) this.pendingListeners.delete(jobId)
      }
    }
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  activeCount() {
    return [...this.entries.values()].filter((entry) => entry.active).length
  }

  reset() {
    for (const entry of this.entries.values()) if (entry.timer !== null) globalThis.clearTimeout(entry.timer)
    this.entries.clear()
    this.discoveries.clear()
    this.pendingListeners.clear()
  }

  private schedule(jobId: string, entry: Entry, delay: number) {
    if (entry.timer !== null || this.isTerminal(entry.snapshot.status)) return
    entry.timer = globalThis.setTimeout(() => {
      entry.timer = null
      void this.poll(jobId, entry)
    }, delay)
  }

  private async poll(jobId: string, entry: Entry) {
    try {
      const job = await entry.reader(jobId)
      this.update(entry, job)
      if (this.settleIfTerminal(entry)) return
    } catch {
      // A transient read failure is not a provider failure. Backend Job truth
      // remains unchanged and the same observer retries the read.
    }
    this.schedule(jobId, entry, 1000)
  }

  private update(entry: Entry, job: DurableJob<unknown>) {
    entry.snapshot = job
    for (const listener of entry.listeners) listener()
  }

  private settleIfTerminal(entry: Entry) {
    const status = entry.snapshot.status
    if (terminalSuccess.has(status)) {
      if (entry.timer !== null) globalThis.clearTimeout(entry.timer)
      entry.timer = null
      entry.active = false
      entry.resolve(entry.snapshot.result)
      return true
    }
    if (terminalFailure.has(status)) {
      if (entry.timer !== null) globalThis.clearTimeout(entry.timer)
      entry.timer = null
      entry.active = false
      entry.reject(new ApiError(entry.snapshot.error || `Job ${status}.`, 409))
      return true
    }
    return false
  }

  private isTerminal(status: string) {
    return terminalSuccess.has(status) || terminalFailure.has(status)
  }
}

export const jobObserver = new DurableJobObserver()

/** Compatibility Promise for tools not yet migrated to observable handles. */
export function observeJob<T>(jobId: string, read: (id: string) => Promise<DurableJob<T>>): Promise<T> {
  return jobObserver.observe(jobId, read)
}

export function observedJobCount() { return jobObserver.activeCount() }
