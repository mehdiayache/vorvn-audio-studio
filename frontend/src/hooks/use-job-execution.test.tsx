// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { jobObserver, observedJobCount } from "@/lib/job-observer"
import type { DurableJob } from "@/types/domain"
import { useJobExecution } from "./use-job-execution"

const job = (status: DurableJob["status"]): DurableJob<{ url?: string }> => ({
  id: "job-survives-ui", type: "speech", status, progress: status === "ok" ? 1 : 0,
  detail: status, retries: 0, result: status === "ok" ? { url: "/audio/ready.mp3" } : {},
})

afterEach(() => { jobObserver.reset(); vi.useRealTimers() })

describe("useJobExecution", () => {
  it("does not own or cancel observation when its React consumer unmounts", async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue(job("ok"))
    jobObserver.register(job("queued"), read)
    const { result, unmount } = renderHook(() => useJobExecution<{ url?: string }>("job-survives-ui"))
    expect(result.current?.status).toBe("queued")
    unmount()
    expect(observedJobCount()).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await expect(jobObserver.completion("job-survives-ui")).resolves.toEqual({ url: "/audio/ready.mp3" })
    expect(read).toHaveBeenCalledTimes(1)
    expect(observedJobCount()).toBe(0)
  })
})
