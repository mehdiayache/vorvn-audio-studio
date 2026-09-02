// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectLibraryGallery } from "./project-library-gallery"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

afterEach(cleanup)

describe("ProjectLibraryGallery", () => {
  it("keeps failed requests out of the normal media wall until failed items are revealed", () => {
    render(<ProjectLibraryGallery
      files={[]} uploads={[]}
      creationItems={[
        { id: "ready", status: "ready", mediaType: "image", node: <div>Ready creation</div> },
        { id: "failed", status: "failed", mediaType: "video", node: <div>Failed creation</div> },
      ]}
      pendingId={null}
      onPreview={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()} onOpenLibrary={vi.fn()}
    />)
    expect(screen.getByText("Ready creation")).toBeTruthy()
    expect(screen.queryByText("Failed creation")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show failed 1" }))
    expect(screen.getByText("Failed creation")).toBeTruthy()
    expect(document.querySelector(".project-library-gallery-items")?.classList.contains("is-single-row")).toBe(true)
  })

  it("offers the three canonical provenance families without provider-specific filters", () => {
    render(<ProjectLibraryGallery
      files={[{ id: 7, media_type: "image", name: "Legacy", filename: "legacy.png" }]} uploads={[]}
      pendingId={null}
      onPreview={vi.fn()} onRemove={vi.fn()} onRetryUpload={vi.fn()} onDismissUpload={vi.fn()} onUpload={vi.fn()} onOpenLibrary={vi.fn()}
    />)
    expect(screen.getByRole("radio", { name: "Generated" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Uploaded" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Imported" })).toBeTruthy()
    expect(screen.queryByRole("radio", { name: "Freesound" })).toBeNull()
  })
})
