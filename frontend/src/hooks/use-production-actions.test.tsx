// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { studioApi } from "@/lib/api"
import type { DurableJob, GeneratePayload, GenerateResult, Production, ProductionPart, SoundScene } from "@/types/domain"
import { useProductionActions } from "./use-production-actions"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, studioApi: { ...actual.studioApi, preview: vi.fn(), enqueueRecordPart: vi.fn(), savePartEditorial: vi.fn(), editSilence: vi.fn(), deletePart: vi.fn() } }
})

const payload: GeneratePayload = {
  text: "In the beginning", production_id: 28,
  voice_identity_id: "identity-serenity", binding_id: "binding-serenity",
  capability_id: null, format: "mp3",
  language: "English", instruction: "", speech_mode: "exact",
  rate: 1, pitch: 1, volume: 50, seed: 0,
}
const production = { id: 28, name: "Genesis", parts: [] } as unknown as Production
const part = { id: 127, position: 0, kind: "audio" } as ProductionPart
const soundScene = { production_id: 28, revision: 1, document: { version: 1, tracks: [{ id: "music", kind: "music", name: "Music", volume: 1, muted: false, clips: [] }] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", sequence_projection: { signature: "sequence", duration_ms: 0, sample_rate: 48_000, spans: [] }, tracks: [{ id: "music", kind: "music", name: "Music", volume: 1, muted: false, clips: [] }], orphans: [] }, sequence_stem: { url: "", filename: "", duration_ms: 0, signature: "sequence", cached: true } } as SoundScene

describe("useProductionActions durable commands", () => {
  beforeEach(() => vi.clearAllMocks())

  it("retries a failed pending Part with a new Job on the same Part", async () => {
    const pendingPart = { ...part, kind: "speech", clip_id: null } as ProductionPart
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
      production, soundScene, player: player as never,
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
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useProductionActions({
      production, soundScene, player: player as never,
      refresh, refreshAssets: vi.fn(),
    }))
    await act(async () => {
      await result.current.updatePartEditorial(part, {
        expected_revision: 3, script: "Explicit revision",
      })
    })
    expect(studioApi.savePartEditorial).toHaveBeenCalledWith(
      28, 127, { expected_revision: 3, script: "Explicit revision" })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("marks a loaded preview stale when refreshed Production truth changes", async () => {
    const player = {
      source: { key: "preview:28:0", url: "/audio/preview.mp3", title: "Genesis", kind: "production" },
      state: "paused", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    let current = { ...production, parts: [{ ...part, revision: 1 }] } as Production
    const { result, rerender } = renderHook(() => useProductionActions({
      production: current, soundScene, player: player as never,
      refresh: vi.fn(), refreshAssets: vi.fn(),
    }))
    expect(result.current.productionLoaded).toBe(true)
    current = { ...current, parts: [{ ...part, revision: 2 }] }
    rerender()
    await act(async () => { await Promise.resolve() })
    expect(result.current.productionLoaded).toBe(false)
  })

  it("previews current audible media without treating planned Drafts as errors", async () => {
    vi.mocked(studioApi.preview).mockResolvedValue({ url: "/audio/current.mp3", skipped_drafts: 43, cached: false })
    const toggleSource = vi.fn().mockResolvedValue(undefined)
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource, toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const { result } = renderHook(() => useProductionActions({
      production, soundScene, player: player as never,
      refresh: vi.fn(), refreshAssets: vi.fn(),
    }))

    act(() => result.current.toggleProduction())
    await waitFor(() => expect(toggleSource).toHaveBeenCalledTimes(1))
    expect(toggleSource.mock.calls[0]?.[0].subtitle).toBe("Current audible mix · voice only")
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("keeps micro-edit confirmation inline while announcing destructive changes", async () => {
    vi.mocked(studioApi.editSilence).mockResolvedValue({ id: part.id } as never)
    vi.mocked(studioApi.deletePart).mockResolvedValue({ deleted: true } as never)
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const { result } = renderHook(() => useProductionActions({
      production, soundScene, player: player as never,
      refresh: vi.fn().mockResolvedValue(undefined), refreshAssets: vi.fn(),
      feedbackMode: "inline",
    }))

    await act(async () => { await result.current.editSilence(part, 2.5) })
    expect(result.current.mutationStatus).toBe("saved")
    expect(toast.success).not.toHaveBeenCalled()

    await act(async () => { await result.current.deletePart(part) })
    expect(toast.success).toHaveBeenCalledWith("Part permanently deleted")
  })

  it("does not announce a historical export failure when Production opens", async () => {
    const failedExport = {
      id: "export-failed", type: "render", status: "failed", progress: 0.7,
      detail: "FFmpeg could not finish the mix.", error: null, retries: 0, result: {},
    } as DurableJob<{ url?: string; name?: string; error?: string }>
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const failedProduction = { ...production, export_job: failedExport } as Production

    const { result } = renderHook(() => useProductionActions({
      production: failedProduction, soundScene, player: player as never,
      refresh: vi.fn(), refreshAssets: vi.fn(),
    }))

    await act(async () => { await Promise.resolve() })
    expect(toast.error).not.toHaveBeenCalled()
    expect(result.current.exportJob).toBeNull()
  })
})
