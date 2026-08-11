// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import type { DurableJob, GeneratePayload, GenerateResult, MusicBed, Production, ProductionPart, RenderTask, VoiceDirectory } from "@/types/domain"
import { useProductionActions } from "./use-production-actions"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, studioApi: { ...actual.studioApi, enqueueRecordPart: vi.fn(), enqueueRegenerate: vi.fn(), savePartEditorial: vi.fn() } }
})

const payload: GeneratePayload = {
  text: "In the beginning", production_id: 28, insert_at: null,
  voice: "serinity", engine: "omni", model: "plus", format: "mp3",
  language: "English", instruction: "", speech_mode: "exact",
  rate: 1, pitch: 1, volume: 50, seed: 0,
}
const production = { id: 28, name: "Genesis", parts: [] } as unknown as Production
const part = { id: 127, position: 0, kind: "audio" } as ProductionPart
const directory = { config: null, cloned: [], meta: {}, catalog: [] } satisfies VoiceDirectory
const music = { filename: "" } as MusicBed

describe("useProductionActions render completion", () => {
  beforeEach(() => vi.clearAllMocks())

  it("keeps a paid take successful when the follow-up timeline refresh fails", async () => {
    const durableJob: DurableJob<GenerateResult> = { id: "job-real-127", type: "speech", status: "queued", progress: 0, detail: "Queued", retries: 0, result: {} }
    vi.mocked(studioApi.enqueueRegenerate).mockResolvedValue(durableJob)
    const refresh = vi.fn().mockRejectedValue(new Error("refresh offline"))
    const toggleSource = vi.fn().mockResolvedValue(undefined)
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource, toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const { result } = renderHook(() => useProductionActions({
      production, music, directory, player: player as never,
      refresh, refreshAssets: vi.fn(),
    }))

    let enqueued
    await act(async () => { enqueued = await result.current.regeneratePart(part, payload) })
    expect(enqueued).toBe(durableJob)
    expect(toggleSource).not.toHaveBeenCalled()

    const task = { id: "job-real-127", jobId: "job-real-127", mode: "take", status: "ok", payload, text: payload.text, voice: payload.voice, insertAt: null, targetPartId: 127, startedAt: Date.now() } satisfies RenderTask
    let rendered
    await act(async () => { rendered = await result.current.settleRender(task, { id: 127, name: "legacy take.mp3", cost: 0.0169 }) })

    expect(rendered).toMatchObject({ id: 127, url: "/audio/legacy%20take.mp3" })
    expect(studioApi.savePartEditorial).not.toHaveBeenCalled()
    expect(toggleSource).toHaveBeenCalledWith(expect.objectContaining({ url: "/audio/legacy%20take.mp3" }))
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/audio created.*timeline/i))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("retries a failed pending Part with a new Job on the same Part", async () => {
    const pendingPart = { ...part, kind: "speech", selected_take_id: null } as ProductionPart
    const retryJob: DurableJob<GenerateResult> = {
      id: "job-retry-128", type: "speech", status: "queued", progress: 0,
      detail: "Queued", retries: 0, result: {}, part_id: pendingPart.id,
    }
    vi.mocked(studioApi.enqueueRecordPart).mockResolvedValue(retryJob)
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const { result } = renderHook(() => useProductionActions({
      production, music, directory, player: player as never,
      refresh: vi.fn(), refreshAssets: vi.fn(),
    }))

    let returned
    await act(async () => {
      returned = await result.current.recordPendingPart(pendingPart, payload)
    })

    expect(returned).toBe(retryJob)
    expect(studioApi.enqueueRecordPart).toHaveBeenCalledWith(
      pendingPart.id, payload)
    expect(studioApi.savePartEditorial).not.toHaveBeenCalled()
  })

  it("updates Part editorial truth only through the explicit revision-guarded action", async () => {
    vi.mocked(studioApi.savePartEditorial).mockResolvedValue({ ok: true, revision: 4, changed: true, outdated: true })
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const { result } = renderHook(() => useProductionActions({
      production, music, directory, player: player as never,
      refresh: vi.fn(), refreshAssets: vi.fn(),
    }))
    await act(async () => {
      await result.current.updatePartEditorial(part, {
        expected_revision: 3, script: "Explicit revision",
      })
    })
    expect(studioApi.savePartEditorial).toHaveBeenCalledWith(
      28, 127, { expected_revision: 3, script: "Explicit revision" })
  })
})
