// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { useComposerText } from "./use-composer-text"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, studioApi: { ...actual.studioApi, enqueueTextPass: vi.fn(), textPassResult: vi.fn(), confirmJob: vi.fn(), saveTextStates: vi.fn() } }
})

afterEach(cleanup)

describe("useComposerText text preparation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(studioApi.enqueueTextPass).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111", type: "text", status: "queued", progress: 0, detail: "", retries: 0, result: {},
    })
    vi.mocked(studioApi.textPassResult).mockResolvedValue({
      before: "مرحبا", after: "[whispers] مرحبا", difference: [], cost: 0,
    })
    vi.mocked(studioApi.confirmJob).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333", type: "text", status: "queued", progress: 0, detail: "", retries: 0, result: {},
    })
    vi.mocked(studioApi.saveTextStates).mockResolvedValue({} as never)
  })

  it.each(["shape", "tag"] as const)("omits Production identifiers for standalone Speak %s", async (operation) => {
    const { result } = renderHook(() => useComposerText(undefined, undefined, "expressive_tags"))
    act(() => result.current.updateText("مرحبا"))
    await act(async () => { await result.current.run(operation) })

    expect(studioApi.enqueueTextPass).toHaveBeenCalledWith(operation, {
      text: "مرحبا", density: "normal", capability_id: "expressive_tags", confirmed: false,
    })
    await waitFor(() => expect(result.current.review?.kind).toBe(operation))
  })

  it("lets standalone Speak accept the returned Tagged version locally", async () => {
    const { result } = renderHook(() => useComposerText(undefined, undefined, "expressive_tags"))
    act(() => result.current.updateText("مرحبا"))
    await act(async () => { await result.current.run("tag") })
    await waitFor(() => expect(result.current.review).not.toBeNull())
    await act(async () => { await result.current.accept() })

    expect(result.current.view).toBe("tagged")
    expect(result.current.text).toBe("[whispers] مرحبا")
  })

  it("includes Production and Part identifiers inside a Production", async () => {
    const part = { id: 121, text: "مرحبا", text_state: "raw" } as never
    const { result } = renderHook(() => useComposerText(part, 28, "expressive_tags"))
    await act(async () => { await result.current.run("tag") })

    expect(studioApi.enqueueTextPass).toHaveBeenCalledWith("tag", expect.objectContaining({
      production_id: 28, part_id: 121,
    }))
  })

  it("re-observes a persisted paid text Job after the Composer remounts", async () => {
    const reference = { jobId: "22222222-2222-4222-8222-222222222222", kind: "shape" as const }
    const { result } = renderHook(() => useComposerText(undefined, undefined, "expressive_tags", { reviewReference: reference }))
    await waitFor(() => expect(result.current.review?.result.after).toBe("[whispers] مرحبا"))
    expect(studioApi.textPassResult).toHaveBeenCalledWith(reference.jobId)
  })

  it("persists accepted text while clearing the review pointer", async () => {
    const onReviewReferenceChange = vi.fn()
    const { result } = renderHook(() => useComposerText(undefined, undefined, "expressive_tags", { onReviewReferenceChange }))
    act(() => result.current.updateText("مرحبا"))
    await act(async () => { await result.current.run("tag") })
    await waitFor(() => expect(result.current.review).not.toBeNull())
    await act(async () => { await result.current.accept() })
    expect(onReviewReferenceChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ active: "tagged", tagged: "[whispers] مرحبا" }))
  })

  it("keeps a Production candidate unresolved until its text variants are durably saved", async () => {
    let releaseSave!: (value: never) => void
    vi.mocked(studioApi.saveTextStates).mockReturnValue(new Promise((resolve) => { releaseSave = resolve }))
    const part = { id: 121, text: "مرحبا", text_state: "raw" } as never
    const { result } = renderHook(() => useComposerText(part, 28, "expressive_tags"))

    await act(async () => { await result.current.run("tag") })
    await waitFor(() => expect(result.current.review?.result.after).toBe("[whispers] مرحبا"))

    let acceptance!: Promise<void>
    act(() => { acceptance = result.current.accept() })
    await waitFor(() => expect(result.current.busy).toBe("tag"))
    expect(result.current.review).not.toBeNull()
    expect(result.current.view).toBe("raw")

    releaseSave({} as never)
    await act(async () => { await acceptance })
    expect(result.current.review).toBeNull()
    expect(result.current.view).toBe("tagged")
    expect(result.current.text).toBe("[whispers] مرحبا")
  })

  it("publishes the durable Job pointer before a paid result finishes", async () => {
    vi.mocked(studioApi.textPassResult).mockReturnValue(new Promise(() => undefined))
    const onReviewReferenceChange = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useComposerText(undefined, undefined, "expressive_tags", { onReviewReferenceChange }))
    act(() => result.current.updateText("Wait for me"))
    await act(async () => { await result.current.run("shape") })
    expect(onReviewReferenceChange).toHaveBeenCalledWith({
      jobId: "11111111-1111-4111-8111-111111111111", kind: "shape",
    })
    expect(result.current.busy).toBe("shape")
  })

  it("continues the exact blocked text Job instead of enqueueing mutable text again", async () => {
    const blocked = "22222222-2222-4222-8222-222222222222"
    const continued = "33333333-3333-4333-8333-333333333333"
    vi.mocked(studioApi.textPassResult).mockImplementation(async (jobId) => (
      jobId === blocked
        ? { before: "مرحبا", after: "", difference: [], cost: 0, needs_confirmation: true, estimate: .04 }
        : { before: "مرحبا", after: "[whispers] مرحبا", difference: [], cost: .04 }
    ))
    const onReviewReferenceChange = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useComposerText(
      undefined, undefined, "expressive_tags",
      { reviewReference: { jobId: blocked, kind: "tag" }, onReviewReferenceChange },
    ))

    await waitFor(() => expect(result.current.pending?.estimate).toBe(.04))
    await act(async () => { await result.current.confirmPending() })

    expect(studioApi.confirmJob).toHaveBeenCalledWith(blocked)
    expect(studioApi.enqueueTextPass).not.toHaveBeenCalled()
    expect(onReviewReferenceChange).toHaveBeenCalledWith({ jobId: continued, kind: "tag" })
    await waitFor(() => expect(result.current.review?.result.after).toBe("[whispers] مرحبا"))
  })
})
