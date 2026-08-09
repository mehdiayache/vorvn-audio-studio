// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { observeJob, observedJobCount } from "@/lib/job-observer"

afterEach(() => vi.useRealTimers())

describe("job observer", () => {
  it("shares one observation for callers watching the same durable Job", async () => {
    vi.useFakeTimers()
    const read = vi.fn()
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({ status: "ok", result: { value: 7 } })
    const first = observeJob<{ value: number }>("job-1", read)
    const second = observeJob<{ value: number }>("job-1", read)
    expect(first).toBe(second)
    expect(observedJobCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(first).resolves.toEqual({ value: 7 })
    expect(read).toHaveBeenCalledTimes(2)
    expect(observedJobCount()).toBe(0)
  })
})
