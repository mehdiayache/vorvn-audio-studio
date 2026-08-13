// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ProductionMusicLane } from "./production-music-lane"

describe("ProductionMusicLane", () => {
  it("stays compact and makes the parallel Music state explicit", () => {
    const onEdit = vi.fn()
    render(<ProductionMusicLane music={{ music_of: 8, filename: "bed.wav", name: "Low Tide", duration_ms: 90_000, volume: .16, duck: true }} playing={false} previewReady={false} onPlay={vi.fn()} onAdd={vi.fn()} onEdit={onEdit} />)
    expect(screen.getByText("16%")).toBeTruthy()
    expect(screen.getByText("Ducking on")).toBeTruthy()
    expect(screen.getByText("Preview refresh needed")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it("offers Add without creating a fake empty reel", () => {
    const onAdd = vi.fn()
    render(<ProductionMusicLane music={{}} playing={false} previewReady={false} onPlay={vi.fn()} onAdd={onAdd} onEdit={vi.fn()} />)
    expect(screen.getByText("None · narration only")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Add/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
