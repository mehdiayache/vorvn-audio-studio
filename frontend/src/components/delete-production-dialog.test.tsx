// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DeleteProductionDialog } from "@/components/delete-production-dialog"

vi.mock("@/lib/api", () => ({
  studioApi: { deleteProduction: vi.fn() },
}))

describe("DeleteProductionDialog", () => {
  it("requires the exact Production name before permanent deletion", () => {
    render(<DeleteProductionDialog production={{ id: 7, name: "Esther Story" }} open onOpenChange={vi.fn()} onDeleted={vi.fn()} />)
    const button = screen.getByRole("button", { name: "Delete Production permanently" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "esther story" } })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Esther Story" } })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Reusable Venture assets and Voices remain/)).toBeTruthy()
  })
})
