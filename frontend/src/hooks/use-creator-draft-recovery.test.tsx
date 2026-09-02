// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CompositionContext, RecoverableCompositionDraft } from "@/lib/creator-contract"

const api = vi.hoisted(() => ({
  creatorDraft: vi.fn(),
  saveCreatorDraft: vi.fn(),
  deleteCreatorDraft: vi.fn(),
}))

vi.mock("@/lib/api", () => ({ originsApi: api }))

import { useCreatorDraftRecovery } from "./use-creator-draft-recovery"

function emptyDraft(): RecoverableCompositionDraft {
  return {
    voiceIdentityId: null, route: null,
    text: { raw: "", shaped: "", tagged: "", active: "raw" },
    textPreparation: { tagDensity: "normal", spokenProfile: "spoken_1", pendingReview: null },
    delivery: { modeId: null, instruction: "", rate: 1, pitch: 1, volume: 100, seed: 0, enableSsml: false },
    output: { format: "mp3", language: "Auto" },
  }
}

describe("useCreatorDraftRecovery", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("restores the saved standalone draft before enabling generation", async () => {
    const restored = { ...emptyDraft(), text: { raw: "Recovered", shaped: "", tagged: "", active: "raw" as const } }
    api.creatorDraft.mockResolvedValue({ id: "draft-1", state: restored, version: 2, updatedAt: "now" })
    const onRestore = vi.fn()
    const { result } = renderHook(() => useCreatorDraftRecovery({
      context: { kind: "standalone" },
      draft: emptyDraft(), onRestore,
    }))
    expect(result.current.status).toBe("loading")
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(restored))
    expect(result.current.status).toBe("saved")
  })

  it("autosaves meaningful changes and clears with the known version", async () => {
    vi.useFakeTimers()
    api.creatorDraft.mockResolvedValue(null)
    api.saveCreatorDraft.mockResolvedValue({ id: "draft-1", state: emptyDraft(), version: 1, updatedAt: "now" })
    api.deleteCreatorDraft.mockResolvedValue({ deleted: true })
    let draft = emptyDraft()
    const context = { kind: "standalone" as const }
    const { result, rerender } = renderHook(() => useCreatorDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    draft = { ...draft, text: { ...draft.text, raw: "Save me" } }
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(701) })
    expect(api.saveCreatorDraft).toHaveBeenCalledWith(context, draft, null)
    await act(async () => { await result.current.clear() })
    expect(api.deleteCreatorDraft).toHaveBeenCalledWith(context, 1)
  })

  it("saves a paid-review pointer immediately instead of waiting for debounce", async () => {
    api.creatorDraft.mockResolvedValue(null)
    api.saveCreatorDraft.mockResolvedValue({ id: "draft-1", state: emptyDraft(), version: 1, updatedAt: "now" })
    const context = { kind: "standalone" as const }
    const { result } = renderHook(() => useCreatorDraftRecovery({ context, draft: emptyDraft(), onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const next = { ...emptyDraft(), textPreparation: { tagDensity: "normal" as const, spokenProfile: "spoken_2" as const, pendingReview: { jobId: "22222222-2222-4222-8222-222222222222", kind: "shape" as const, spokenProfile: "spoken_2" as const } } }
    await act(async () => { await result.current.saveNow(next) })
    expect(api.saveCreatorDraft).toHaveBeenCalledWith(context, next, null)
    expect(result.current.status).toBe("saved")
  })

  it("preserves the local draft on conflict and reloads only after an explicit action", async () => {
    api.creatorDraft
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "draft-server", version: 4, updatedAt: "later",
        state: { ...emptyDraft(), text: { raw: "Server words", shaped: "", tagged: "", active: "raw" } },
      })
    api.saveCreatorDraft.mockRejectedValue(Object.assign(new Error("Draft conflict"), { status: 409 }))
    const context = { kind: "standalone" as const }
    const local = { ...emptyDraft(), text: { raw: "Local words", shaped: "", tagged: "", active: "raw" as const } }
    const onRestore = vi.fn()
    const { result } = renderHook(() => useCreatorDraftRecovery({ context, draft: local, onRestore }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    await act(async () => { await expect(result.current.saveNow(local)).rejects.toThrow("Draft conflict") })
    expect(result.current.status).toBe("conflict")
    expect(onRestore).not.toHaveBeenCalled()

    await act(async () => { await result.current.reload() })
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ text: expect.objectContaining({ raw: "Server words" }) }))
    expect(result.current.status).toBe("saved")
  })

  it("flushes the latest meaningful edit when the Creator closes before debounce", async () => {
    vi.useFakeTimers()
    api.creatorDraft.mockResolvedValue(null)
    api.saveCreatorDraft.mockResolvedValue({ id: "draft-quick", state: emptyDraft(), version: 1, updatedAt: "now" })
    const context = { kind: "standalone" as const }
    let draft = emptyDraft()
    const { rerender, unmount } = renderHook(() => useCreatorDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    draft = { ...draft, text: { ...draft.text, raw: "Do not lose this" } }
    rerender()
    unmount()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(api.saveCreatorDraft).toHaveBeenCalledWith(context, draft, null)
  })

  it("restores the exact quick edit after close and reopen", async () => {
    vi.useFakeTimers()
    let stored: RecoverableCompositionDraft | null = null
    api.creatorDraft.mockImplementation(async () => stored ? { id: "draft-fast", state: stored, version: 1, updatedAt: "now" } : null)
    api.saveCreatorDraft.mockImplementation(async (_context, next) => {
      stored = next
      return { id: "draft-fast", state: next, version: 1, updatedAt: "now" }
    })
    const context = { kind: "standalone" as const }
    let draft = emptyDraft()
    const first = renderHook(() => useCreatorDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    draft = { ...draft, text: { ...draft.text, raw: "Last keystroke before close" } }
    first.rerender(); first.unmount()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    const restore = vi.fn()
    renderHook(() => useCreatorDraftRecovery({ context, draft: emptyDraft(), onRestore: restore }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({ text: expect.objectContaining({ raw: "Last keystroke before close" }) }))
  })

  it("flushes the standalone Draft before switching to a Project owner", async () => {
    vi.useFakeTimers()
    api.creatorDraft.mockResolvedValue(null)
    api.saveCreatorDraft.mockImplementation(async (_context, next) => ({ id: "draft", state: next, version: 1, updatedAt: "now" }))
    const firstContext = { kind: "standalone" as const }
    const secondContext = { kind: "project" as const, projectId: 7, operation: "new_part" as const, insertion: null }
    let context: CompositionContext = firstContext
    let draft = emptyDraft()
    const { rerender } = renderHook(() => useCreatorDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const firstDraft = { ...draft, text: { ...draft.text, raw: "Belongs only to Speak" } }
    draft = firstDraft
    rerender()
    context = secondContext
    draft = { ...emptyDraft(), text: { ...emptyDraft().text, raw: "Project draft" } }
    rerender()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(api.saveCreatorDraft).toHaveBeenCalledWith(firstContext, firstDraft, null)
    expect(api.saveCreatorDraft).not.toHaveBeenCalledWith(firstContext, expect.objectContaining({ text: expect.objectContaining({ raw: "Project draft" }) }), expect.anything())
  })

  it("does not resurrect a deliberately cleared draft during unmount", async () => {
    api.creatorDraft.mockResolvedValue({ id: "draft-old", state: emptyDraft(), version: 3, updatedAt: "now" })
    api.deleteCreatorDraft.mockResolvedValue({ deleted: true })
    const context = { kind: "standalone" as const }
    const draft = { ...emptyDraft(), text: { ...emptyDraft().text, raw: "Generated words" } }
    const { result, unmount } = renderHook(() => useCreatorDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await waitFor(() => expect(result.current.status).toBe("saved"))
    await act(async () => { await result.current.clear() })
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(api.deleteCreatorDraft).toHaveBeenCalledWith(context, 3)
    expect(api.saveCreatorDraft).not.toHaveBeenCalled()
  })
})
