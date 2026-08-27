// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"
import { VisualClipInspector } from "./visual-clip-inspector"

afterEach(cleanup)

describe("VisualClipInspector", () => {
  it("shows source and placement truth and persists deliberate controls", () => {
    const clip: VisualSceneClip = { id: "clip", asset_id: 5, start_ms: 2_000, duration_ms: 8_500, source_offset_ms: 1_000, fit: "contain", locked: false }
    const track: VisualSceneTrack = { id: "track", name: "Video", media_type: "video", visible: true, locked: false, clips: [clip] }
    const asset = { id: 5, media_type: "video", name: "Evening shore", filename: "shore.mp4", width: 1920, height: 1080, duration_ms: 12_000, channels: 2, sample_rate: 48_000, metadata: { audio_codec: "aac" } } as VentureAsset
    const setClipFit = vi.fn()
    const setClipLocked = vi.fn()
    const session = { setClipFit, setClipLocked } as unknown as VisualSceneSession

    render(<VisualClipInspector clipRef={{ trackId: "track", clipId: "clip" }} track={track} clip={clip} asset={asset} session={session} saving={false} />)

    expect(screen.getByText("Evening shore")).toBeTruthy()
    expect(screen.getByText("AAC · Stereo · 48 kHz")).toBeTruthy()
    expect(screen.getByText("8.5s")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Fill and crop" }))
    expect(setClipFit).toHaveBeenCalledWith({ trackId: "track", clipId: "clip" }, "cover")
    fireEvent.click(screen.getByRole("button", { name: "Lock placement" }))
    expect(setClipLocked).toHaveBeenCalledWith({ trackId: "track", clipId: "clip" }, true)
  })
})
