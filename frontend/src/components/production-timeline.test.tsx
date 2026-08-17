// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProductionTimeline } from "@/components/production-timeline"
import type { ProductionPart } from "@/types/domain"

afterEach(cleanup)

const parts: ProductionPart[] = [
  { id: 1, created_at: "", position: 0, kind: "speech", text: "Welcome", cost: .01, duration_ms: 8_000 },
  { id: 2, created_at: "", position: 1, kind: "silence", text: "", cost: 0, duration_ms: 2_000 },
  { id: 3, created_at: "", position: 2, kind: "asset", title: "Outro", text: "Outro", cost: 0, duration_ms: 10_000 },
  { id: 4, created_at: "", position: 3, kind: "draft", text: "Not generated", cost: 0, duration_ms: 0 },
]

describe("ProductionTimeline", () => {
  it("zooms from fit without changing production data", () => {
    render(<ProductionTimeline parts={parts} music={{}} currentTime={0} productionLoaded={false} onLocate={vi.fn()} onSeek={vi.fn()} />)
    expect(screen.getByText("Fit")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("1×")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("2×")).toBeTruthy()
    expect(screen.getByTitle("3. SFX · 0:10 · Outro")).toBeTruthy()
    expect(screen.getByText("Narration")).toBeTruthy()
    expect(screen.getByText("SFX")).toBeTruthy()
    expect(screen.getByText("Music")).toBeTruthy()
    expect(screen.getByText(/1 Draft has no audio yet and consumes no timeline time/)).toBeTruthy()
  })

  it("locates a source clip and only advertises seeking for a loaded mix", () => {
    const locate = vi.fn()
    const { rerender } = render(<ProductionTimeline parts={parts} music={{}} currentTime={0} productionLoaded={false} onLocate={locate} onSeek={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /Locate part 1/ }))
    expect(locate).toHaveBeenCalledWith(1)
    expect(screen.getByText(/Play the full Production/)).toBeTruthy()
    rerender(<ProductionTimeline parts={parts} music={{}} currentTime={4} productionLoaded onLocate={locate} onSeek={vi.fn()} />)
    expect(screen.getByText(/Click any lane to seek/)).toBeTruthy()
  })

  it("supports keyboard seeking on a loaded production", () => {
    const seek = vi.fn()
    render(<ProductionTimeline parts={parts} music={{}} currentTime={4} productionLoaded onLocate={vi.fn()} onSeek={seek} />)
    const timeline = screen.getByRole("slider", { name: "Production position" })
    fireEvent.keyDown(timeline, { key: "ArrowRight" })
    expect(seek).toHaveBeenCalledWith(9)
    fireEvent.keyDown(timeline, { key: "End" })
    expect(seek).toHaveBeenLastCalledWith(Number(timeline.getAttribute("aria-valuemax")))
  })

  it("uses recorded Silence duration and keeps Drafts out of production time", () => {
    render(<ProductionTimeline parts={parts} music={{}} currentTime={0} productionLoaded={false} onLocate={vi.fn()} onSeek={vi.fn()} />)
    expect(screen.getByRole("slider", { name: "Production position" }).getAttribute("aria-valuemax")).toBe("20")
    expect(screen.getByTitle("2. silence · 0:02 · Silence 2.0s")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Locate part 4/ })).toBeNull()
  })
})
