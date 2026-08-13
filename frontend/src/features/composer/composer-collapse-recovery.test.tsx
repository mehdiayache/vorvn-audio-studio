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

import { StudioDock } from "./studio-dock"

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("Composer collapse recovery", () => {
  it("flushes a quick edit before collapse and restores it after expand", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    let stored: unknown = null
    api.composerDraft.mockResolvedValue(null)
    api.saveComposerDraft.mockImplementation(async (_context, draft) => {
      stored = draft
      return { id: "draft-1", state: draft, version: 1, updatedAt: "now" }
    })
    render(<StudioDock title="Add speech" description="Insert speech" onClose={vi.fn()} productionId={7} config={null} directory={{ config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null }} playerPlaying={false} onGenerate={vi.fn()} onPlay={vi.fn()} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    fireEvent.click(screen.getByRole("button", { name: /Words:/ }))
    fireEvent.change(screen.getByPlaceholderText("Type or paste what should be said…"), { target: { value: "Fast collapse edit" } })
    fireEvent.click(screen.getByRole("button", { name: "Collapse Composer" }))
    await waitFor(() => expect(api.saveComposerDraft).toHaveBeenCalled())
    expect(stored).toMatchObject({ text: { raw: "Fast collapse edit" } })
    fireEvent.click(screen.getByRole("button", { name: "Expand Composer" }))
    expect((screen.getByPlaceholderText("Type or paste what should be said…") as HTMLTextAreaElement).value).toBe("Fast collapse edit")
  })
})
