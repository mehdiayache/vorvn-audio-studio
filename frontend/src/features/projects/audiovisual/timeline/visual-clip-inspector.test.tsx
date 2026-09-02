// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { WorkspaceFile, VisualSceneClip, VisualSceneTrack } from "@/types/domain"
import { VisualClipInspector } from "./visual-clip-inspector"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

afterEach(cleanup)

describe("VisualClipInspector", () => {
  it("shows source and placement truth and persists deliberate controls", () => {
    const clip: VisualSceneClip = { id: "clip", file_id: 5, start_ms: 2_000, duration_ms: 8_500, source_offset_ms: 1_000, fit: "contain", position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }
    const track: VisualSceneTrack = { id: "track", name: "Video", media_type: "video", visible: true, locked: false, clips: [clip] }
    const file = { id: 5, media_type: "video", name: "Evening shore", filename: "shore.mp4", width: 1920, height: 1080, duration_ms: 12_000, channels: 2, sample_rate: 48_000, metadata: { audio_codec: "aac" } } as WorkspaceFile
    const frameClip = vi.fn()
    const setClipTransform = vi.fn()
    const session = { frameClip, setClipTransform } as unknown as VisualSceneSession

    render(<VisualClipInspector clipRef={{ trackId: "track", clipId: "clip" }} track={track} clip={clip} file={file} session={session} saving={false} />)

    expect(screen.getByText("Evening shore")).toBeTruthy()
    expect(screen.getByText("AAC · Stereo · 48 kHz")).toBeTruthy()
    expect(screen.getByText("8.5s")).toBeTruthy()
    expect(screen.queryByText("Fill and crop")).toBeNull()
    expect(screen.getByRole("button", { name: "Fill" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Fit" })).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Rotation" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Fit" }))
    expect(frameClip).toHaveBeenCalledWith({ trackId: "track", clipId: "clip" }, "contain")
    fireEvent.click(screen.getByRole("button", { name: "Flip horizontal" }))
    expect(setClipTransform).toHaveBeenCalledWith({ trackId: "track", clipId: "clip" }, { flip_horizontal: true })
    expect(screen.queryByRole("button", { name: "Lock placement" })).toBeNull()
  })

  it("uses human video-audio controls and exposes the canonical clip level", () => {
    const clip: VisualSceneClip = { id: "clip", file_id: 5, start_ms: 0, duration_ms: 8_500, source_offset_ms: 0, fit: "contain", position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }
    const track: VisualSceneTrack = { id: "track", name: "Video", media_type: "video", visible: true, locked: false, clips: [clip] }
    const file = { id: 5, media_type: "video", name: "Evening shore", filename: "shore.mp4", duration_ms: 12_000, channels: 2, sample_rate: 48_000, metadata: { audio_codec: "aac" } } as WorkspaceFile
    const session = {} as unknown as VisualSceneSession

    render(<VisualClipInspector clipRef={{ trackId: "track", clipId: "clip" }} track={track} clip={clip} file={file} session={session} saving={false} hasEmbeddedAudio audioGain={1} onAudioMixChange={vi.fn()} onAudioMixCommit={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Mute Video volume" })).toBeTruthy()
    expect(screen.queryByText("Play embedded audio")).toBeNull()
    expect(screen.getByRole("slider", { name: "Video volume" })).toBeTruthy()
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0)
  })

  it("starts a transform gesture before a keyboard Scale preview", () => {
    const clip: VisualSceneClip = { id: "clip", file_id: 5, start_ms: 0, duration_ms: 8_500, source_offset_ms: 0, fit: "contain", position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }
    const track: VisualSceneTrack = { id: "track", name: "Video", media_type: "video", visible: true, locked: false, clips: [clip] }
    const file = { id: 5, media_type: "video", name: "Evening shore", filename: "shore.mp4", duration_ms: 12_000 } as WorkspaceFile
    const beginGesture = vi.fn()
    const previewClipTransform = vi.fn()
    const commitGesture = vi.fn()
    const session = { beginGesture, previewClipTransform, commitGesture } as unknown as VisualSceneSession

    render(<VisualClipInspector clipRef={{ trackId: "track", clipId: "clip" }} track={track} clip={clip} file={file} session={session} saving={false} />)
    const scale = screen.getByRole("slider", { name: "Scale" })
    fireEvent.keyDown(scale, { key: "ArrowRight" })
    fireEvent.keyUp(scale, { key: "ArrowRight" })

    expect(beginGesture).toHaveBeenCalledTimes(2)
    expect(previewClipTransform).toHaveBeenCalledWith({ trackId: "track", clipId: "clip" }, { scale: 1.01 })
    expect(beginGesture.mock.invocationCallOrder[0]).toBeLessThan(previewClipTransform.mock.invocationCallOrder[0]!)
    expect(commitGesture).toHaveBeenCalledOnce()
    expect(previewClipTransform.mock.calls.at(-1)).toEqual([{ trackId: "track", clipId: "clip" }, { scale: 1.01 }])
  })
})
