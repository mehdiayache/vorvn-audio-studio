// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/production-timeline", () => ({ ProductionTimeline: () => <div>Timeline blocks</div> }))

import { TimingOverview } from "@/components/timing-overview"
import type { ProductionPart } from "@/types/domain"

describe("TimingOverview", () => {
  it("stays a read-only view and does not mount a redundant Player presentation", () => {
    const parts = [{ id: 1, kind: "silence", title: "2.5", duration_ms: 2500 }] as ProductionPart[]
    render(<TimingOverview parts={parts} music={{}} productionCurrentTime={0} productionLoaded={false} onLocate={vi.fn()} onSeekProduction={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "1 Part · 0:03" })).toBeTruthy()
    expect(screen.getByText("Timeline blocks")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /production/i })).toBeNull()
  })

  it("can close its bottom workspace without changing timeline truth", () => {
    const onClose = vi.fn()
    render(<TimingOverview parts={[]} music={{}} productionCurrentTime={0} productionLoaded={false} onLocate={vi.fn()} onSeekProduction={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Close Timing" }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
