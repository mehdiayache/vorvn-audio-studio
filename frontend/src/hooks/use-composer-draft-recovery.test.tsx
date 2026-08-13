// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { RecoverableCompositionDraft } from "@/lib/composer-contract"

const api = vi.hoisted(() => ({
  composerDraft: vi.fn(),
  saveComposerDraft: vi.fn(),
  deleteComposerDraft: vi.fn(),
}))

vi.mock("@/lib/api", () => ({ studioApi: api }))

import { useComposerDraftRecovery } from "./use-composer-draft-recovery"

function emptyDraft(): RecoverableCompositionDraft {
  return {
    voiceIdentityId: null, castRoleId: null, route: null,
    text: { raw: "", shaped: "", tagged: "", active: "raw" },
    textPreparation: { tagDensity: "normal", pendingReview: null },
    delivery: { modeId: null, instruction: "", rate: 1, pitch: 1, volume: 50, seed: 0 },
    output: { format: "mp3", language: "Auto" },
  }
}

describe("useComposerDraftRecovery", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("restores a saved session before enabling generation", async () => {
    const restored = { ...emptyDraft(), text: { raw: "Recovered", shaped: "", tagged: "", active: "raw" as const } }
    api.composerDraft.mockResolvedValue({ id: "draft-1", state: restored, version: 2, updatedAt: "now" })
    const onRestore = vi.fn()
    const { result } = renderHook(() => useComposerDraftRecovery({
      context: { kind: "standalone", sessionId: "11111111-1111-4111-8111-111111111111" },
      draft: emptyDraft(), onRestore,
    }))
    expect(result.current.status).toBe("loading")
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(restored))
    expect(result.current.status).toBe("saved")
  })

  it("autosaves meaningful changes and clears with the known version", async () => {
    vi.useFakeTimers()
    api.composerDraft.mockResolvedValue(null)
    api.saveComposerDraft.mockResolvedValue({ id: "draft-1", state: emptyDraft(), version: 1, updatedAt: "now" })
    api.deleteComposerDraft.mockResolvedValue({ deleted: true })
    let draft = emptyDraft()
    const context = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    const { result, rerender } = renderHook(() => useComposerDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    draft = { ...draft, text: { ...draft.text, raw: "Save me" } }
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(701) })
    expect(api.saveComposerDraft).toHaveBeenCalledWith(context, draft, null)
    await act(async () => { await result.current.clear() })
    expect(api.deleteComposerDraft).toHaveBeenCalledWith(context, 1)
  })

  it("saves a paid-review pointer immediately instead of waiting for debounce", async () => {
    api.composerDraft.mockResolvedValue(null)
    api.saveComposerDraft.mockResolvedValue({ id: "draft-1", state: emptyDraft(), version: 1, updatedAt: "now" })
    const context = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    const { result } = renderHook(() => useComposerDraftRecovery({ context, draft: emptyDraft(), onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const next = { ...emptyDraft(), textPreparation: { tagDensity: "normal" as const, pendingReview: { jobId: "22222222-2222-4222-8222-222222222222", kind: "shape" as const } } }
    await act(async () => { await result.current.saveNow(next) })
    expect(api.saveComposerDraft).toHaveBeenCalledWith(context, next, null)
    expect(result.current.status).toBe("saved")
  })

  it("preserves the local draft on conflict and reloads only after an explicit action", async () => {
    api.composerDraft
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "draft-server", version: 4, updatedAt: "later",
        state: { ...emptyDraft(), text: { raw: "Server words", shaped: "", tagged: "", active: "raw" } },
      })
    api.saveComposerDraft.mockRejectedValue(Object.assign(new Error("Draft conflict"), { status: 409 }))
    const context = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    const local = { ...emptyDraft(), text: { raw: "Local words", shaped: "", tagged: "", active: "raw" as const } }
    const onRestore = vi.fn()
    const { result } = renderHook(() => useComposerDraftRecovery({ context, draft: local, onRestore }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    await act(async () => { await expect(result.current.saveNow(local)).rejects.toThrow("Draft conflict") })
    expect(result.current.status).toBe("conflict")
    expect(onRestore).not.toHaveBeenCalled()

    await act(async () => { await result.current.reload() })
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ text: expect.objectContaining({ raw: "Server words" }) }))
    expect(result.current.status).toBe("saved")
  })

  it("flushes the latest meaningful edit when the Composer closes before debounce", async () => {
    vi.useFakeTimers()
    api.composerDraft.mockResolvedValue(null)
    api.saveComposerDraft.mockResolvedValue({ id: "draft-quick", state: emptyDraft(), version: 1, updatedAt: "now" })
    const context = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    let draft = emptyDraft()
    const { rerender, unmount } = renderHook(() => useComposerDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    draft = { ...draft, text: { ...draft.text, raw: "Do not lose this" } }
    rerender()
    unmount()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(api.saveComposerDraft).toHaveBeenCalledWith(context, draft, null)
  })

  it("restores the exact quick edit after close and reopen", async () => {
    vi.useFakeTimers()
    let stored: RecoverableCompositionDraft | null = null
    api.composerDraft.mockImplementation(async () => stored ? { id: "draft-fast", state: stored, version: 1, updatedAt: "now" } : null)
    api.saveComposerDraft.mockImplementation(async (_context, next) => {
      stored = next
      return { id: "draft-fast", state: next, version: 1, updatedAt: "now" }
    })
    const context = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    let draft = emptyDraft()
    const first = renderHook(() => useComposerDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    draft = { ...draft, text: { ...draft.text, raw: "Last keystroke before close" } }
    first.rerender(); first.unmount()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    const restore = vi.fn()
    renderHook(() => useComposerDraftRecovery({ context, draft: emptyDraft(), onRestore: restore }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({ text: expect.objectContaining({ raw: "Last keystroke before close" }) }))
  })

  it("flushes the old Draft to the old owner during an immediate context switch", async () => {
    vi.useFakeTimers()
    api.composerDraft.mockResolvedValue(null)
    api.saveComposerDraft.mockImplementation(async (_context, next) => ({ id: "draft", state: next, version: 1, updatedAt: "now" }))
    const firstContext = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    const secondContext = { kind: "standalone" as const, sessionId: "22222222-2222-4222-8222-222222222222" }
    let context = firstContext
    let draft = emptyDraft()
    const { rerender } = renderHook(() => useComposerDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const firstDraft = { ...draft, text: { ...draft.text, raw: "Belongs only to session A" } }
    draft = firstDraft
    rerender()
    context = secondContext
    draft = { ...emptyDraft(), text: { ...emptyDraft().text, raw: "Session B" } }
    rerender()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(api.saveComposerDraft).toHaveBeenCalledWith(firstContext, firstDraft, null)
    expect(api.saveComposerDraft).not.toHaveBeenCalledWith(firstContext, expect.objectContaining({ text: expect.objectContaining({ raw: "Session B" }) }), expect.anything())
  })

  it("does not resurrect a deliberately cleared draft during unmount", async () => {
    api.composerDraft.mockResolvedValue({ id: "draft-old", state: emptyDraft(), version: 3, updatedAt: "now" })
    api.deleteComposerDraft.mockResolvedValue({ deleted: true })
    const context = { kind: "standalone" as const, sessionId: "11111111-1111-4111-8111-111111111111" }
    const draft = { ...emptyDraft(), text: { ...emptyDraft().text, raw: "Generated words" } }
    const { result, unmount } = renderHook(() => useComposerDraftRecovery({ context, draft, onRestore: vi.fn() }))
    await waitFor(() => expect(result.current.status).toBe("saved"))
    await act(async () => { await result.current.clear() })
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(api.deleteComposerDraft).toHaveBeenCalledWith(context, 3)
    expect(api.saveComposerDraft).not.toHaveBeenCalled()
  })
})
