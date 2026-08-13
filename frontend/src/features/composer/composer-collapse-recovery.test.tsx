// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  composerDraft: vi.fn(), saveComposerDraft: vi.fn(), deleteComposerDraft: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ studioApi: api }))
vi.mock("@/components/global-player-provider", () => ({
  useGlobalPlayer: () => ({ transportHost: "shell", claimTransport: vi.fn(() => vi.fn()) }),
}))

import { ProductionComposerStage } from "./production-composer-host"

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("Production Composer recovery", () => {
  it("flushes a quick edit when the Stage closes and restores it when reopened", async () => {
    let stored: unknown = null
    api.composerDraft.mockImplementation(async () => stored ? { id: "draft-1", state: stored, version: 1, updatedAt: "now" } : null)
    api.saveComposerDraft.mockImplementation(async (_context, draft) => {
      stored = draft
      return { id: "draft-1", state: draft, version: 1, updatedAt: "now" }
    })
    const props = { productionId: 7, config: null, directory: { config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null }, playerPlaying: false, onGenerate: vi.fn(), onPlay: vi.fn() }
    const view = render(<ProductionComposerStage {...props} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    fireEvent.change(screen.getByPlaceholderText("Type or paste what should be said…"), { target: { value: "Fast collapse edit" } })
    view.unmount()
    await waitFor(() => expect(api.saveComposerDraft).toHaveBeenCalled())
    expect(stored).toMatchObject({ text: { raw: "Fast collapse edit" } })
    render(<ProductionComposerStage {...props} />)
    await waitFor(() => expect((screen.getByPlaceholderText("Type or paste what should be said…") as HTMLTextAreaElement).value).toBe("Fast collapse edit"))
    expect((screen.getByPlaceholderText("Type or paste what should be said…") as HTMLTextAreaElement).value).toBe("Fast collapse edit")
  })
})
