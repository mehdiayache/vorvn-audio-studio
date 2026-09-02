// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DeleteProjectDialog } from "@/features/projects/audiovisual/delete-project-dialog"

vi.mock("@/lib/api", () => ({
  originsApi: { deleteProject: vi.fn() },
}))

describe("DeleteProjectDialog", () => {
  it("uses the common DELETE confirmation before permanent deletion", () => {
    render(<DeleteProjectDialog project={{ id: 7, name: "Esther Story" }} open onOpenChange={vi.fn()} onDeleted={vi.fn()} />)
    const button = screen.getByRole("button", { name: "Delete Project permanently" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), { target: { value: "delete" } })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), { target: { value: "DELETE" } })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Reusable Workspace Files and Voices remain/)).toBeTruthy()
    expect(screen.getByText(/Content-free provider operation and spend evidence remains in Activity/)).toBeTruthy()
    expect(screen.queryByText(/local Project activity/)).toBeNull()
  })
})
