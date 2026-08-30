// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueChange, onValueCommit, disabled }: { "aria-label"?: string; onValueChange?: (value: number[]) => void; onValueCommit?: (value: number[]) => void; disabled?: boolean }) => {
    const value = label === "Clip volume" ? 50 : label === "Track volume" ? 75 : label === "Audio fade in" ? 1.5 : label === "Speech reduction" ? -18 : 3.5
    return <button type="button" aria-label={label} disabled={disabled} onClick={() => { onValueChange?.([value]); onValueCommit?.([value]) }} />
  },
}))
vi.mock("@/features/sound-scene/source-editor/music-source-editor", () => ({
  AudioSourceEditor: ({ onChange, onCommit, disabled }: { onChange: (value: { sourceOffsetMs: number; durationMs: null }) => void; onCommit: (value: { sourceOffsetMs: number; durationMs: null }) => void; disabled?: boolean }) => <section aria-label="Audio source window"><button disabled={disabled} onClick={() => { const value = { sourceOffsetMs: 5_500, durationMs: null as null }; onChange(value); onCommit(value) }}>Move source window</button></section>,
}))

import { AudioClipInspector } from "@/features/sound-scene/inspector/music-inspector"

const clip = { id: "78af885c-aeb4-49bf-9edb-d3fc14496b2c", asset_id: 9, filename: "bed.mp3", asset_name: "Bed", source_duration_ms: 60_000, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, muted: false, locked: false, effects: [], anchor: { kind: "absolute" as const, position_ms: 0 } }
const track = { id: "music", kind: "audio" as const, name: "Music", volume: 1, muted: false, clips: [clip] }

afterEach(cleanup)

describe("AudioClipInspector", () => {
  it("commits exact mix values and keeps audition separate", async () => {
    const onClipChange = vi.fn()
    const onClipCommit = vi.fn().mockResolvedValue(undefined)
    const onPlay = vi.fn()
    render(<AudioClipInspector track={track} clip={clip} playing={false} onPlay={onPlay} onClipChange={onClipChange} onClipCommit={onClipCommit} onTrackMixChange={vi.fn()} onTrackMixCommit={vi.fn()} onChoose={vi.fn()} />)
    expect(screen.getByRole("region", { name: "Audio source window" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play audio audition" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "asset-source:9", kind: "asset" }))
    fireEvent.click(screen.getByRole("button", { name: "Clip volume" }))
    expect(onClipChange).toHaveBeenCalledWith({ gain: .5, muted: false })
    await waitFor(() => expect(onClipCommit).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Move source window" }))
    expect(onClipChange).toHaveBeenCalledWith({ source_offset_ms: 5_500, duration_ms: null })
    await waitFor(() => expect(onClipCommit).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole("button", { name: "Speech reduction" }))
    expect(onClipChange).toHaveBeenCalledWith({ duck_amount_db: -18 })
    await waitFor(() => expect(onClipCommit).toHaveBeenCalledTimes(3))
  })

  it("keeps a failed save visible in the owning Workbench", async () => {
    const onClipCommit = vi.fn().mockRejectedValue(new Error("Music settings are unavailable."))
    render(<AudioClipInspector track={track} clip={clip} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={onClipCommit} onTrackMixChange={vi.fn()} onTrackMixCommit={vi.fn()} onChoose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Audio fade in" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Music settings are unavailable.")
  })

  it("does not project sequential Part language onto an empty Audio Track", () => {
    render(<AudioClipInspector track={{ ...track, clips: [] }} clip={null} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={vi.fn()} onTrackMixChange={vi.fn()} onTrackMixCommit={vi.fn()} onChoose={vi.fn()} />)
    expect(screen.getByText(/Add one reusable Audio Library clip/)).toBeTruthy()
    expect(screen.queryByText(/Clip|Voice/)).toBeNull()
  })

  it("locks editing geometry without locking mix controls", () => {
    render(<AudioClipInspector track={track} clip={{ ...clip, locked: true }} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={vi.fn()} onTrackMixChange={vi.fn()} onTrackMixCommit={vi.fn()} onChoose={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Move source window" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: /Replace source/ }).hasAttribute("disabled")).toBe(true)
    expect(screen.queryByRole("button", { name: /Remove clip/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Audio fade in" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Clip volume" }).hasAttribute("disabled")).toBe(false)
    expect(screen.getByText(/Volume and effects remain available/)).toBeTruthy()
  })

  it("shows the factual combined output without prescribing a reset", () => {
    const onTrackMixChange = vi.fn()
    const onTrackMixCommit = vi.fn().mockResolvedValue(undefined)
    render(<AudioClipInspector track={{ ...track, volume: .06 }} clip={clip} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={vi.fn()} onTrackMixChange={onTrackMixChange} onTrackMixCommit={onTrackMixCommit} onChoose={vi.fn()} />)

    expect(screen.getByText(/Output 1%/)).toBeTruthy()
    expect(screen.queryByText(/Very quiet|music bed|Reset track/)).toBeNull()
  })

  it("shows canonical SFX identity and rich technical metadata", () => {
    render(<AudioClipInspector track={track} clip={{ ...clip, asset_kind: "sfx" }} asset={{ id: 9, title: "Door latch", category: "sfx", duration_ms: 60_000, audio_format: "wav", sample_rate: 48_000, channels: 2, metadata: { origin: "generated", model: "stable-audio-3-small-sfx" } }} playing={false} onPlay={vi.fn()} onClipChange={vi.fn()} onClipCommit={vi.fn()} onTrackMixChange={vi.fn()} onTrackMixCommit={vi.fn()} onChoose={vi.fn()} />)

    expect(screen.getByText("Door latch")).toBeTruthy()
    expect(screen.getByText(/SFX · Generated · Stable Audio · SFX/)).toBeTruthy()
    expect(screen.getByText(/1:00 · WAV · 48 kHz · Stereo/)).toBeTruthy()
    expect(screen.queryByText(/music bed/)).toBeNull()
  })
})
