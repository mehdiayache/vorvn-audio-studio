// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueCommit, disabled }: { "aria-label"?: string; onValueCommit?: (value: number[]) => void; disabled?: boolean }) => {
    const value = label === "Music mix level" ? 24 : label === "Music source position" ? 5.5 : label === "Music fade in" ? 1.5 : 3.5
    return <button type="button" aria-label={label} disabled={disabled} onClick={() => onValueCommit?.([value])} />
  },
}))

import { MusicWorkbench } from "./music-workbench"

const clip = { id: "78af885c-aeb4-49bf-9edb-d3fc14496b2c", asset_id: 9, filename: "bed.mp3", asset_name: "Bed", source_duration_ms: 60_000, start_ms: 0, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, anchor: { kind: "absolute" as const, position_ms: 0 } }
const track = { id: "music", kind: "music" as const, name: "Music", muted: false, clips: [clip] }

afterEach(cleanup)

describe("MusicWorkbench", () => {
  it("commits exact mix values and keeps audition separate", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    const onPlay = vi.fn()
    render(<MusicWorkbench track={track} clip={clip} playing={false} onPlay={onPlay} onChange={onChange} onChoose={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole("region", { name: "Music source waveform" })).toBeTruthy()
    expect(screen.getByText("Source start")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play music audition" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "asset-source:9", kind: "music" }))
    fireEvent.click(screen.getByRole("button", { name: "Music mix level" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ gain: .24 }))
    fireEvent.click(screen.getByRole("button", { name: "Music source position" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ source_offset_ms: 5_500 }))
  })

  it("keeps a failed save visible in the owning Workbench", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("Music settings are unavailable."))
    render(<MusicWorkbench track={track} clip={clip} playing={false} onPlay={vi.fn()} onChange={onChange} onChoose={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Music fade in" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Music settings are unavailable.")
  })

  it("does not project sequential Part language onto an empty Music lane", () => {
    render(<MusicWorkbench track={{ ...track, clips: [] }} clip={null} playing={false} onPlay={vi.fn()} onChange={vi.fn()} onChoose={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/Add one reusable Venture track/)).toBeTruthy()
    expect(screen.queryByText(/Clip|Voice/)).toBeNull()
  })
})
