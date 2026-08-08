// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SequenceInsertControl } from "@/components/sequence-insert-control"

afterEach(cleanup)

describe("SequenceInsertControl", () => {
  it("describes the exact insertion point", () => {
    render(<SequenceInsertControl at={2} insertAt={9} onInsert={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Add part at position 3" })).toBeTruthy()
    expect(screen.getByText("Add part")).toBeTruthy()
  })

  it("uses a distinct final action", () => {
    render(<SequenceInsertControl at={6} insertAt={null} last onInsert={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Add part at position 7" })).toBeTruthy()
    expect(screen.getByText("Add part")).toBeTruthy()
  })
})
