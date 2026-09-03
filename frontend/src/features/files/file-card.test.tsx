// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FileCard, FileUsedState } from "./file-card"

afterEach(cleanup)

describe("FileCard", () => {
  it("preserves audio identity, audition, tags, duration, selection and usage state", () => {
    const select = vi.fn()
    const audition = vi.fn()
    const { container } = render(<FileCard
      file={{
        id: 17, media_type: "audio", category: "music", name: "Opening score",
        filename: "opening.wav", duration_ms: 12_300, tags: ["intro", "bright", "campaign"],
        metadata: { origin: "generated", provider_id: "ai.vrn.one" },
      }}
      interaction={{ selected: true, onInvoke: select }}
      audition={{ playing: false, onToggle: audition }}
      slots={{ state: <FileUsedState count={2} /> }}
    />)

    expect(container.querySelector("[data-file-source='generated']")).toBeTruthy()
    expect(screen.getAllByText("Music").length).toBeGreaterThan(0)
    expect(screen.getByText("12.3s")).toBeTruthy()
    expect(screen.getByText("intro")).toBeTruthy()
    expect(screen.getByText("bright")).toBeTruthy()
    expect(screen.getByText("+1")).toBeTruthy()
    expect(screen.getByLabelText("Used in Timeline").textContent).toContain("2")
    expect(screen.getByRole("button", { name: "Select Opening score" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Audition Opening score" }))
    fireEvent.click(screen.getByRole("button", { name: "Select Opening score" }))
    expect(audition).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledOnce()
  })

  it("preserves visual preview, dimensions and format", () => {
    const preview = vi.fn()
    render(<FileCard file={{
      id: 18, media_type: "image", name: "Campaign hero", filename: "hero.webp",
      url: "/media/hero.webp", width: 1600, height: 900, media_format: "webp",
    }} preview={{ onOpen: preview }} />)

    expect(screen.getByText("1600 × 900 · WEBP")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "Preview Campaign hero" })[0]!)
    expect(preview).toHaveBeenCalledOnce()
  })

  it("preserves the Ambience audio family instead of flattening it to Sound Effect", () => {
    const { container } = render(<FileCard file={{
      id: 19, media_type: "audio", category: "ambience", name: "Harbour room tone",
      filename: "harbour.wav", duration_ms: 4_000,
    }} />)
    expect(container.querySelector("[data-audio-family='ambience']")).toBeTruthy()
    expect(screen.getAllByText("Ambience").length).toBeGreaterThan(0)
    expect(screen.queryByText("Sound Effect")).toBeNull()
  })
})
