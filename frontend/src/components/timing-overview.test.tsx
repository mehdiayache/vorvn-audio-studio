// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/production-timeline", () => ({ ProductionTimeline: () => <div>Timeline blocks</div> }))

import { TimingOverview } from "@/components/timing-overview"
import type { ProductionPart } from "@/types/domain"

afterEach(cleanup)

describe("TimingOverview", () => {
  it("stays a read-only view and does not mount a redundant Player presentation", () => {
    const parts = [{ id: 1, kind: "silence", title: "2.5", duration_ms: 2500 }] as ProductionPart[]
    render(<TimingOverview parts={parts} music={{}} productionCurrentTime={0} productionLoaded={false} onLocate={vi.fn()} onSeekProduction={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "0:03 · 0 voice · 0 SFX" })).toBeTruthy()
    expect(screen.getByText(/1 deliberate pause · No music/)).toBeTruthy()
    expect(screen.getByText("Timeline blocks")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /production/i })).toBeNull()
  })

  it("can return from the full Timing view without changing timeline truth", () => {
    const onClose = vi.fn()
    render(<TimingOverview parts={[]} music={{}} productionCurrentTime={0} productionLoaded={false} onLocate={vi.fn()} onSeekProduction={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Close Timing" }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("reports preview preparation and readiness without replacing the timeline", () => {
    const props = { parts: [] as ProductionPart[], music: {}, productionCurrentTime: 0, onLocate: vi.fn(), onSeekProduction: vi.fn() }
    const { rerender } = render(<TimingOverview {...props} previewing productionLoaded={false} />)
    expect(screen.getByText("Preparing preview…")).toBeTruthy()
    expect(screen.getByText("Timeline blocks")).toBeTruthy()
    rerender(<TimingOverview {...props} previewing={false} productionLoaded />)
    expect(screen.getByText("Preview ready")).toBeTruthy()
  })
})
