// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProductionLibraryGallery } from "./production-library-gallery"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()

describe("ProductionLibraryGallery", () => {
  it("keeps failed requests out of the normal media wall until failed items are revealed", () => {
    render(<ProductionLibraryGallery
      files={[]} uploads={[]}
      creationItems={[
        { id: "ready", status: "ready", mediaType: "image", node: <div>Ready creation</div> },
        { id: "failed", status: "failed", mediaType: "video", node: <div>Failed creation</div> },
      ]}
      pendingId={null}
      onPreview={vi.fn()} onAddToProduction={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()}
    />)
    expect(screen.getByText("Ready creation")).toBeTruthy()
    expect(screen.queryByText("Failed creation")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show failed 1" }))
    expect(screen.getByText("Failed creation")).toBeTruthy()
    expect(document.querySelector(".production-library-gallery-items")?.classList.contains("is-single-row")).toBe(true)
  })

  it("offers the three canonical provenance families without provider-specific filters", () => {
    render(<ProductionLibraryGallery
      files={[{ id: 7, media_type: "image", name: "Legacy", filename: "legacy.png" }]} uploads={[]}
      pendingId={null}
      onPreview={vi.fn()} onAddToProduction={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()}
    />)
    expect(screen.getByRole("radio", { name: "Generated" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Uploaded" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Imported" })).toBeTruthy()
    expect(screen.queryByRole("radio", { name: "Freesound" })).toBeNull()
  })

  it("moves between This Production, Current Folder and Workspace without changing presentation", async () => {
    const production = { id: 7, media_type: "image" as const, name: "Production hero", filename: "production.png", folder_id: 12 }
    const workspace = { id: 8, media_type: "image" as const, name: "Workspace hero", filename: "workspace.png", folder_id: null }
    render(<ProductionLibraryGallery
      files={[production, workspace]} productionFileIds={[7]} libraryFileIds={[7]} currentFolderId={12}
      uploads={[]} pendingId={null}
      onPreview={vi.fn()} onAddToProduction={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()}
    />)
    expect(screen.getAllByRole("button", { name: "Preview Production hero" }).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole("button", { name: "Preview Workspace hero" })).toHaveLength(0)

    fireEvent.click(screen.getByRole("combobox", { name: "Library scope" }))
    fireEvent.click(await screen.findByRole("option", { name: "Workspace" }))
    expect(screen.getAllByRole("button", { name: "Preview Production hero" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "Preview Workspace hero" }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("combobox", { name: "Library scope" }))
    fireEvent.click(await screen.findByRole("option", { name: "Current Folder" }))
    expect(screen.getAllByRole("button", { name: "Preview Production hero" }).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole("button", { name: "Preview Workspace hero" })).toHaveLength(0)
  })

  it("defines Used here from supplied Production usage rather than association", async () => {
    render(<ProductionLibraryGallery
      files={[
        { id: 7, media_type: "image", name: "Associated only", filename: "linked.png" },
        { id: 8, media_type: "image", name: "Actually used", filename: "used.png" },
      ]}
      productionFileIds={[7, 8]} libraryFileIds={[7, 8]} usageCounts={new Map([[8, 2]])}
      uploads={[]} pendingId={null}
      onPreview={vi.fn()} onAddToProduction={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()}
    />)
    fireEvent.click(screen.getByRole("combobox", { name: "Production usage" }))
    fireEvent.click(await screen.findByRole("option", { name: "Used here" }))
    expect(screen.getAllByRole("button", { name: "Preview Actually used" }).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole("button", { name: "Preview Associated only" })).toHaveLength(0)
  })

  it("keeps an operation in the Library immediately and then shows its canonical File", () => {
    const props = {
      productionFileIds: [] as number[], libraryFileIds: [] as number[], uploads: [], pendingId: null,
      onPreview: vi.fn(), onAddToProduction: vi.fn(), onRemove: vi.fn(), onRetryUpload: vi.fn(), onDismissUpload: vi.fn(), onUpload: vi.fn(),
    }
    const { rerender } = render(<ProductionLibraryGallery {...props} files={[]} creationItems={[{
      id: "job-7", status: "generating", mediaType: "speech", productionAssociated: true,
      node: <div>Creating speech now</div>,
    }]} />)
    expect(screen.getByText("Creating speech now")).toBeTruthy()

    rerender(<ProductionLibraryGallery {...props} files={[{
      id: 19, media_type: "audio", source: "generated", category: "speech", name: "Finished speech", filename: "speech.mp3",
    }]} productionFileIds={[19]} libraryFileIds={[19]} creationItems={[]} />)
    expect(screen.queryByText("Creating speech now")).toBeNull()
    expect(screen.getByText("Finished speech")).toBeTruthy()
  })
})
