// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SequenceInsertControl } from "@/components/sequence-insert-control"
import { TooltipProvider } from "@/components/ui/tooltip"

afterEach(cleanup)

describe("SequenceInsertControl", () => {
  it("describes the exact insertion point", () => {
    render(<TooltipProvider><SequenceInsertControl at={2} beforePartId="part-9" onInsert={vi.fn()} /></TooltipProvider>)
    const trigger = screen.getByRole("button", { name: "Add part at position 3" })
    expect(trigger.querySelector("svg")).toBeTruthy()
    expect(trigger.textContent).toBe("")
  })

  it("uses a distinct final action", () => {
    const { container } = render(<TooltipProvider><SequenceInsertControl at={6} beforePartId={null} last onInsert={vi.fn()} /></TooltipProvider>)
    expect(screen.getByRole("button", { name: "Add part at position 7" })).toBeTruthy()
    expect(container.querySelector(".sequence-insert.last")).toBeTruthy()
  })
})
