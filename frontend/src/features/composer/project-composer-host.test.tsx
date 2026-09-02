// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { ProjectComposerSession } from "./project-composer-host"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
  vi.spyOn(originsApi, "composerDraft").mockResolvedValue(null)
  vi.spyOn(originsApi, "saveComposerDraft").mockResolvedValue({ id: "draft-1", state: {} as never, version: 1, updatedAt: "now" })
  vi.spyOn(originsApi, "deleteComposerDraft").mockResolvedValue({ deleted: true })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren() })

describe("ProjectComposerSession", () => {
  it("moves the same live Draft from its sequence seam into the Project Stage", async () => {
    const inline = document.createElement("div")
    const stage = document.createElement("div")
    document.body.append(inline, stage)
    const props = {
      projectId: 7,
      config: null,
      directory: { config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null },
      playerPlaying: false,
      onGenerate: vi.fn(),
      onPlay: vi.fn(),
      onExpand: vi.fn(),
      onClose: vi.fn(),
    }
    const view = render(<ProjectComposerSession {...props} target={inline} presentation="inline" />)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Original script" })).toBeTruthy())
    fireEvent.change(screen.getByRole("textbox", { name: "Original script" }), { target: { value: "The same live Project Draft" } })

    view.rerender(<ProjectComposerSession {...props} target={stage} presentation="stage" />)

    expect((screen.getByRole("textbox", { name: "Original script" }) as HTMLTextAreaElement).value).toBe("The same live Project Draft")
    expect(inline.querySelector("textarea")).toBeNull()
    expect(stage.querySelector("textarea")).toBeTruthy()
    expect(screen.getByLabelText("Performance and output settings")).toBeTruthy()
    expect(screen.getByText("Shape the delivery")).toBeTruthy()
    expect(screen.getByText("File settings")).toBeTruthy()
  })
})
