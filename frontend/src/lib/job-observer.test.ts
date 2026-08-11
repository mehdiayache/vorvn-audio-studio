// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { jobObserver, observeJob, observedJobCount } from "@/lib/job-observer"
import type { DurableJob } from "@/types/domain"

const job = (status: DurableJob["status"], result: Record<string, unknown> = {}): DurableJob => ({
  id: "job-1", type: "speech", status, progress: status === "ok" ? 1 : 0.2,
  detail: status, error: status === "failed" ? "Provider rejected the request" : null,
  retries: 0, result,
})

afterEach(() => { jobObserver.reset(); vi.useRealTimers() })

describe("job observer", () => {
  it("registers the durable Job immediately and shares one polling loop across subscribers", async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue(job("ok", { value: 7 }))
    jobObserver.register(job("queued"), read)
    const first = vi.fn(); const second = vi.fn()
    const unsubscribeFirst = jobObserver.subscribe("job-1", first)
    const unsubscribeSecond = jobObserver.subscribe("job-1", second)
    expect(jobObserver.getSnapshot("job-1")).toMatchObject({ id: "job-1", status: "queued" })
    expect(observedJobCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(0)
    await expect(jobObserver.completion("job-1")).resolves.toEqual({ value: 7 })
    expect(read).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1)
    expect(observedJobCount()).toBe(0)
    unsubscribeFirst(); unsubscribeSecond()
  })

  it("exposes a terminal backend failure and cleans active observation", async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue(job("failed"))
    jobObserver.register(job("running"), read)
    const completion = jobObserver.completion("job-1")
    await vi.advanceTimersByTimeAsync(0)
    await expect(completion).rejects.toThrow("Provider rejected")
    expect(jobObserver.getSnapshot("job-1")).toMatchObject({ status: "failed" })
    expect(observedJobCount()).toBe(0)
  })

  it("keeps the compatibility Promise deduplicated for unrelated callers", async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue(job("ok", { value: 9 }))
    const first = observeJob<{ value: number }>("job-1", read)
    const second = observeJob<{ value: number }>("job-1", read)
    expect(first).toBe(second)
    await vi.advanceTimersByTimeAsync(0)
    await expect(first).resolves.toEqual({ value: 9 })
    expect(read).toHaveBeenCalledTimes(1)
  })
})
