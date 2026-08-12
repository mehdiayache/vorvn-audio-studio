// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { jobObserver } from "@/lib/job-observer"
import { studioApi } from "@/lib/api"
import type { DurableJob, GenerateResult } from "@/types/domain"
import { useRenderTasks, type RenderTaskDraft } from "./use-render-tasks"

const draft: RenderTaskDraft = { mode: "new", text: "Hello", voice: "Tina", insertAt: null, payload: { text: "Hello", production_id: 28, insert_at: null, voice: "Tina", engine: "omni", model: "plus", format: "mp3", language: "English", instruction: "", speech_mode: "exact", rate: 1, pitch: 1, volume: 50, seed: 0 } }
const durable = (status: DurableJob<GenerateResult>["status"], result = {} as GenerateResult): DurableJob<GenerateResult> => ({ id: "backend-job-77", type: "speech", status, progress: 0, detail: status, retries: 0, result, part_id: 127 })

afterEach(() => { jobObserver.reset(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("useRenderTasks", () => {
  it("uses the backend Job ID immediately and settles from global observation", async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue(durable("ok", { id: 127, url: "/audio/ready.mp3" }))
    const executor = vi.fn(async () => { const job = durable("queued"); jobObserver.register(job, read); return job })
    const success = vi.fn(async () => undefined)
    const { result } = renderHook(() => useRenderTasks(executor, success))
    let returned!: DurableJob<GenerateResult>
    await act(async () => { returned = await result.current.enqueue(draft) })
    expect(returned.id).toBe("backend-job-77")
    expect(result.current.tasks[0]).toMatchObject({ id: "backend-job-77", jobId: "backend-job-77", status: "queued", mode: "pending", targetPartId: 127 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(success).toHaveBeenCalledWith(expect.objectContaining({ jobId: "backend-job-77" }), expect.objectContaining({ id: 127 }))
    expect(result.current.tasks).toHaveLength(0)
  })

  it("retains backend failure evidence for an explicit retry", async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue({ ...durable("failed"), error: "Provider timeout" })
    const executor = vi.fn(async () => { const job = durable("running"); jobObserver.register(job, read); return job })
    const { result } = renderHook(() => useRenderTasks(executor, vi.fn(async () => undefined)))
    await act(async () => { await result.current.enqueue(draft); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.tasks[0]).toMatchObject({ id: "backend-job-77", status: "failed", error: "Provider timeout" })
  })

  it("recovers a Production Job after the Composer and creating page state disappear", async () => {
    vi.useFakeTimers()
    vi.spyOn(studioApi, "job").mockResolvedValue({
      ...durable("failed"), error: "Durable provider evidence",
    })
    const success = vi.fn(async () => undefined)
    const { result } = renderHook(() => useRenderTasks(vi.fn(), success))
    const recovered = {
      ...draft,
      id: "backend-job-77", jobId: "backend-job-77",
      mode: "pending", status: "running", targetPartId: 127,
      startedAt: Date.now(),
    } as const

    act(() => result.current.recover(recovered, durable("running")))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(result.current.tasks[0]).toMatchObject({
      jobId: "backend-job-77", targetPartId: 127,
      status: "failed", error: "Durable provider evidence",
    })
    expect(success).not.toHaveBeenCalled()
  })

  it("continues a cost-confirmation block as one new linked durable Job", async () => {
    vi.useFakeTimers()
    const blocked = durable("blocked", { needs_confirmation: true, estimate: .04 })
    const continued = { ...durable("queued"), id: "confirmed-job-88" }
    vi.spyOn(studioApi, "confirmJob").mockImplementation(async () => {
      jobObserver.register(continued, vi.fn().mockResolvedValue({
        ...continued, status: "running",
      }))
      return continued
    })
    const { result } = renderHook(() => useRenderTasks(vi.fn(), vi.fn(async () => undefined)))
    const recovered = {
      ...draft, id: blocked.id, jobId: blocked.id, mode: "pending",
      status: "blocked", targetPartId: 127, startedAt: Date.now(),
      needsConfirmation: true, estimate: .04,
    } as const
    act(() => result.current.recover(recovered, blocked))
    await act(async () => { await result.current.confirm(recovered) })
    await act(async () => { await result.current.confirm(recovered) })

    expect(studioApi.confirmJob).toHaveBeenCalledTimes(2)
    expect(studioApi.confirmJob).toHaveBeenCalledWith("backend-job-77")
    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0]).toMatchObject({
      jobId: "confirmed-job-88", targetPartId: 127, status: "queued",
    })
  })
})
