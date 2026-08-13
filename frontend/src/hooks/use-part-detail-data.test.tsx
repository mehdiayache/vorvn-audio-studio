// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DurableJob, ProductionPart } from "@/types/domain"
import { jobObserver } from "@/lib/job-observer"

const api = vi.hoisted(() => ({
  captions: vi.fn(), transcript: vi.fn(), job: vi.fn(), enqueueTranscribePart: vi.fn(), enqueueTranscriptTranslation: vi.fn(), confirmJob: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ studioApi: api }))

import { usePartDetailData } from "./use-part-detail-data"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

const part = (id: number): ProductionPart => ({ id, kind: "speech", text: `Part ${id}`, cost: 0, created_at: "", position: id })
const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

afterEach(() => { vi.clearAllMocks(); jobObserver.reset() })

describe("usePartDetailData", () => {
  it("never lets a late Part A response overwrite the open Part B", async () => {
    const captionsA = deferred<{ transcripts: Array<{ id: number }> }>()
    api.captions.mockImplementation((_production: number, id: number) => id === 1 ? captionsA.promise : Promise.resolve({ transcripts: [{ id: 202 }] }))
    let activePart: ProductionPart | null = part(1)
    const { result, rerender } = renderHook(() => usePartDetailData(7, activePart, vi.fn().mockResolvedValue(undefined)), { wrapper })
    activePart = part(2)
    rerender()
    await waitFor(() => expect(result.current.captions.map((caption) => caption.id)).toEqual([202]))
    await act(async () => { captionsA.resolve({ transcripts: [{ id: 101 }] }); await Promise.resolve() })
    expect(result.current.captions.map((caption) => caption.id)).toEqual([202])
  })

  it("exposes the durable caption Job immediately and keeps its identity in the route", async () => {
    api.captions.mockResolvedValue({ transcripts: [] })
    const queued = { id: "caption-1", type: "transcribe", status: "queued", progress: 0, detail: "Queued", retries: 0, context: { part_id: 1 }, result: {} } as DurableJob
    api.enqueueTranscribePart.mockImplementation(async () => {
      jobObserver.register(queued, vi.fn().mockResolvedValue({ ...queued, status: "running" }))
      return queued
    })
    const activePart = part(1)
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => {
      const detail = usePartDetailData(7, activePart, onChanged)
      return { detail, search: useLocation().search }
    }, { wrapper })
    await waitFor(() => expect(result.current.detail.loading).toBe(false))
    await act(async () => { await result.current.detail.makeCaptions() })
    await waitFor(() => expect(result.current.detail.captionJob).toMatchObject({ id: "caption-1", status: "queued" }))
    expect(result.current.search).toContain("part-caption-job=caption-1")
  })

  it("recovers exact cost confirmation and confirms that same durable Job", async () => {
    api.captions.mockResolvedValue({ transcripts: [] })
    const blocked = { id: "caption-confirm", type: "transcribe", status: "blocked", progress: 0, detail: "Confirm", retries: 0, context: { part_id: 1 }, result: { part_id: 1, needs_confirmation: true, estimate: 0.0312 } } as DurableJob
    jobObserver.register(blocked, vi.fn())
    const continued = { ...blocked, status: "queued", result: {} }
    api.confirmJob.mockResolvedValue(continued)
    const recoverWrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={["/production?part-caption-job=caption-confirm"]}>{children}</MemoryRouter>
    const activePart = part(1)
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => usePartDetailData(7, activePart, onChanged), { wrapper: recoverWrapper })
    await waitFor(() => expect(result.current.captionConfirmation).toEqual({ kind: "transcribe", estimate: 0.0312, target: undefined }))
    await act(async () => { await result.current.confirmCaptionAction() })
    expect(api.confirmJob).toHaveBeenCalledWith("caption-confirm")
  })
})
