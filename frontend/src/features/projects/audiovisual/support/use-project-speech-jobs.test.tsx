// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { originsApi } from "@/lib/api"
import { jobObserver } from "@/lib/job-observer"
import type { DurableJob, GenerateResult, ProjectPart } from "@/types/domain"
import { useProjectSpeechJobs } from "./use-project-speech-jobs"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

afterEach(() => {
  jobObserver.reset()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("useProjectSpeechJobs", () => {
  it("announces one concise toast when an observed recording becomes ready", async () => {
    vi.useFakeTimers()
    const queued: DurableJob<GenerateResult> = {
      id: "speech-ready", type: "speech", status: "queued", progress: 0,
      detail: "Queued", retries: 0, result: {}, part_id: 81,
    }
    const ready: DurableJob<GenerateResult> = {
      ...queued, status: "ok", progress: 1, detail: "Recording ready",
      result: { part_id: 81, take_id: 91, duration_ms: 4_200 },
    }
    const part = {
      id: 81, position: 7, kind: "speech", authored_role: "Narrator",
      text: "A calm opening.", speech_job: queued,
    } as ProjectPart
    vi.spyOn(originsApi, "job").mockResolvedValue(ready)
    const refresh = vi.fn().mockResolvedValue(undefined)

    renderHook(() => useProjectSpeechJobs([part], refresh))
    expect(toast.success).not.toHaveBeenCalled()

    await act(async () => {
      await vi.runAllTimersAsync()
      await Promise.resolve()
    })
    expect(toast.success).toHaveBeenCalledWith("Recording ready", { description: "Part 08 · Narrator" })
    expect(toast.success).toHaveBeenCalledTimes(1)
  })
})
