// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectLibraryDialog } from "./project-library-dialog"

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()

describe("ProjectLibraryDialog", () => {
  it("uses the universal scope and actual-usage semantics in picker presentation", async () => {
    render(<ProjectLibraryDialog
      open
      files={[
        { id: 1, media_type: "image", name: "Project still", filename: "project.png", source: "uploaded" },
        { id: 2, media_type: "image", name: "Workspace still", filename: "workspace.png", source: "generated" },
      ]}
      projectFileIds={[1]}
      usedFileIds={[2]}
      initialScope="project"
      pendingId={null}
      onOpenChange={vi.fn()}
      onPreview={vi.fn()}
      onAdd={vi.fn()}
    />)
    expect(screen.getByText("Project still")).toBeTruthy()
    expect(screen.queryByText("Workspace still")).toBeNull()

    fireEvent.click(screen.getByRole("combobox", { name: "Library scope" }))
    fireEvent.click(await screen.findByRole("option", { name: "Workspace" }))
    expect(screen.getByText("Project still")).toBeTruthy()
    expect(screen.getByText("Workspace still")).toBeTruthy()

    fireEvent.click(screen.getByRole("combobox", { name: "Project usage" }))
    fireEvent.click(await screen.findByRole("option", { name: "Used here" }))
    expect(screen.queryByText("Project still")).toBeNull()
    expect(screen.getByText("Workspace still")).toBeTruthy()
  })
})
