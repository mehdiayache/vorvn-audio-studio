// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueChange, onValueCommit, disabled }: { "aria-label"?: string; onValueChange?: (value: number[]) => void; onValueCommit?: (value: number[]) => void; disabled?: boolean }) => {
    const value = label === "Music clip gain" ? 24 : label === "Music track volume" ? 70 : label === "Music fade in" ? 1.5 : 3.5
    return <button type="button" aria-label={label} disabled={disabled} onClick={() => { onValueChange?.([value]); onValueCommit?.([value]) }} />
  },
}))
vi.mock("./music-waveform-editor", () => ({
  MusicWaveformEditor: ({ onChange, onCommit }: { onChange: (value: { sourceOffsetMs: number; durationMs: null }) => void; onCommit: (value: { sourceOffsetMs: number; durationMs: null }) => void }) => <section aria-label="Music source window"><button onClick={() => { const value = { sourceOffsetMs: 5_500, durationMs: null as null }; onChange(value); onCommit(value) }}>Move source window</button></section>,
}))

import { MusicWorkbench } from "./music-workbench"

const clip = { id: "78af885c-aeb4-49bf-9edb-d3fc14496b2c", asset_id: 9, filename: "bed.mp3", asset_name: "Bed", source_duration_ms: 60_000, start_ms: 0, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, anchor: { kind: "absolute" as const, position_ms: 0 } }
const track = { id: "music", kind: "music" as const, name: "Music", volume: 1, muted: false, clips: [clip] }

afterEach(cleanup)

describe("MusicWorkbench", () => {
  it("commits exact mix values and keeps audition separate", async () => {
    const onClipChange = vi.fn()
    const onClipCommit = vi.fn().mockResolvedValue(undefined)
    const onPlay = vi.fn()
    render(<MusicWorkbench track={track} clip={clip} playing={false} onPlay={onPlay} onClipChange={onClipChange} onClipCommit={onClipCommit} onTrackVolumeChange={vi.fn()} onTrackVolumeCommit={vi.fn()} onChoose={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole("region", { name: "Music source window" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play music audition" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "asset-source:9", kind: "music" }))
    fireEvent.click(screen.getByRole("button", { name: "Music clip gain" }))
    expect(onClipChange).toHaveBeenCalledWith({ gain: .24 })
    await waitFor(() => expect(onClipCommit).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Move source window" }))
    expect(onClipChange).toHaveBeenCalledWith({ source_offset_ms: 5_500, duration_ms: null })
    await waitFor(() => expect(onClipCommit).toHaveBeenCalledTimes(2))
  })

  it("keeps a failed save visible in the owning Workbench", async () => {
    const onClipCommit = vi.fn().mockRejectedValue(new Error("Music settings are unavailable."))
    render(<MusicWorkbench track={track} clip={clip} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={onClipCommit} onTrackVolumeChange={vi.fn()} onTrackVolumeCommit={vi.fn()} onChoose={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Music fade in" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Music settings are unavailable.")
  })

  it("does not project sequential Part language onto an empty Music lane", () => {
    render(<MusicWorkbench track={{ ...track, clips: [] }} clip={null} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={vi.fn()} onTrackVolumeChange={vi.fn()} onTrackVolumeCommit={vi.fn()} onChoose={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/Add one reusable Venture track/)).toBeTruthy()
    expect(screen.queryByText(/Clip|Voice/)).toBeNull()
  })
})
