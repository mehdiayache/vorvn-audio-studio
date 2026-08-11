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
})
