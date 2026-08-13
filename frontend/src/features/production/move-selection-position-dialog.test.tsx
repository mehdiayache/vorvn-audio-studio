// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MoveSelectionPositionDialog } from "./move-selection-position-dialog"

describe("MoveSelectionPositionDialog", () => {
  it("submits a one-based target for the stable selected block", async () => {
    const onMove = vi.fn().mockResolvedValue(undefined)
    render(<MoveSelectionPositionDialog open count={20} selectedCount={3} onClose={vi.fn()} onMove={onMove} />)
    fireEvent.change(screen.getByRole("spinbutton", { name: "New selection position" }), { target: { value: "8" } })
    fireEvent.click(screen.getByRole("button", { name: "Move to position 8" }))
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(8))
  })

  it("clamps the start so the whole selected block remains inside the Sequence", () => {
    render(<MoveSelectionPositionDialog open count={20} selectedCount={5} onClose={vi.fn()} onMove={vi.fn()} />)
    const input = screen.getByRole("spinbutton", { name: "New selection position" }) as HTMLInputElement
    fireEvent.change(input, { target: { value: "20" } })
    expect(input.value).toBe("16")
    expect(screen.getByRole("button", { name: "Move to position 16" })).toBeTruthy()
  })
})
