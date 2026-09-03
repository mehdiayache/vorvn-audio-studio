// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { ProjectSpeechCreatorSession as ProjectCreatorSession } from "./project-speech-creator-host"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
  vi.spyOn(originsApi, "creatorDraft").mockResolvedValue(null)
  vi.spyOn(originsApi, "saveCreatorDraft").mockResolvedValue({ id: "draft-1", state: {} as never, version: 1, updatedAt: "now" })
  vi.spyOn(originsApi, "deleteCreatorDraft").mockResolvedValue({ deleted: true })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren() })

describe("ProjectCreatorSession", () => {
  it("moves the same live Draft from its sequence seam into the Project Stage", async () => {
    const inline = document.createElement("div")
    const stage = document.createElement("div")
    document.body.append(inline, stage)
    const props = {
      context: { workspace_id: 4, project_id: 7, selection: { target: "script_part" } },
      config: null,
      directory: { config: null, cloned: [], meta: {}, catalog: [], identities: [], registry: null },
      playerPlaying: false,
      onGenerate: vi.fn(),
      onPlay: vi.fn(),
      onExpand: vi.fn(),
      onClose: vi.fn(),
    }
    const view = render(<ProjectCreatorSession {...props} target={inline} presentation="inline" />)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Original script" })).toBeTruthy())
    fireEvent.change(screen.getByRole("textbox", { name: "Original script" }), { target: { value: "The same live Project Draft" } })

    view.rerender(<ProjectCreatorSession {...props} target={stage} presentation="stage" />)

    expect((screen.getByRole("textbox", { name: "Original script" }) as HTMLTextAreaElement).value).toBe("The same live Project Draft")
    expect(inline.querySelector("textarea")).toBeNull()
    expect(stage.querySelector("textarea")).toBeTruthy()
    expect(stage.querySelector(".creator-capability-panel")).toBeTruthy()
    const disclosures = stage.querySelectorAll("details.creator-disclosure > summary")
    expect(disclosures).toHaveLength(2)
    fireEvent.click(disclosures[0]!)
    fireEvent.click(disclosures[1]!)
    expect(screen.getByText("Shape the delivery")).toBeTruthy()
    expect(screen.getByText("File settings")).toBeTruthy()
  })
})
