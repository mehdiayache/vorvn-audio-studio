// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProductionLibraryDialog } from "./production-library-dialog"

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()

describe("ProductionLibraryDialog", () => {
  it("uses the universal scope and actual-usage semantics in picker presentation", async () => {
    render(<ProductionLibraryDialog
      open
      files={[
        { id: 1, media_type: "image", name: "Production still", filename: "production.png", source: "uploaded" },
        { id: 2, media_type: "image", name: "Workspace still", filename: "workspace.png", source: "generated" },
      ]}
      productionFileIds={[1]}
      usedFileIds={[2]}
      initialScope="production"
      pendingId={null}
      onOpenChange={vi.fn()}
      onPreview={vi.fn()}
      onAdd={vi.fn()}
    />)
    expect(screen.getByText("Production still")).toBeTruthy()
    expect(screen.queryByText("Workspace still")).toBeNull()

    fireEvent.click(screen.getByRole("combobox", { name: "Library scope" }))
    fireEvent.click(await screen.findByRole("option", { name: "Workspace" }))
    expect(screen.getByText("Production still")).toBeTruthy()
    expect(screen.getByText("Workspace still")).toBeTruthy()

    fireEvent.click(screen.getByRole("combobox", { name: "Production usage" }))
    fireEvent.click(await screen.findByRole("option", { name: "Used here" }))
    expect(screen.queryByText("Production still")).toBeNull()
    expect(screen.getByText("Workspace still")).toBeTruthy()
  })
})
