// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { ProductionComposerSession } from "./production-composer-host"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
  vi.spyOn(studioApi, "composerDraft").mockResolvedValue(null)
  vi.spyOn(studioApi, "saveComposerDraft").mockResolvedValue({ id: "draft-1", state: {} as never, version: 1, updatedAt: "now" })
  vi.spyOn(studioApi, "deleteComposerDraft").mockResolvedValue({ deleted: true })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren() })

describe("ProductionComposerSession", () => {
  it("moves the same live Draft from its sequence seam into the Workbench", async () => {
    const inline = document.createElement("div")
    const workbench = document.createElement("div")
    document.body.append(inline, workbench)
    const props = {
      productionId: 7,
      config: null,
      directory: { config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null },
      playerPlaying: false,
      onGenerate: vi.fn(),
      onPlay: vi.fn(),
      onExpand: vi.fn(),
      onClose: vi.fn(),
    }
    const view = render(<ProductionComposerSession {...props} target={inline} presentation="inline" />)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Original script" })).toBeTruthy())
    fireEvent.change(screen.getByRole("textbox", { name: "Original script" }), { target: { value: "The same live Production Draft" } })

    view.rerender(<ProductionComposerSession {...props} target={workbench} presentation="workbench" />)

    expect((screen.getByRole("textbox", { name: "Original script" }) as HTMLTextAreaElement).value).toBe("The same live Production Draft")
    expect(inline.querySelector("textarea")).toBeNull()
    expect(workbench.querySelector("textarea")).toBeTruthy()
  })
})
