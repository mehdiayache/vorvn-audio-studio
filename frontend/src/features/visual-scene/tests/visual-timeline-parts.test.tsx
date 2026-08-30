// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"
import { VisualContextToolbar, VisualTimelineClip } from "../timeline/visual-timeline-parts"

const clip = {
  id: "visual-clip",
  asset_id: 91,
  start_ms: 2_000,
  duration_ms: 12_000,
  source_offset_ms: 0,
  fit: "cover",
  locked: false,
} as VisualSceneClip

const image = {
  id: 91,
  name: "Story still",
  filename: "story-still.png",
  media_type: "image",
} as VentureAsset

const video = {
  ...image,
  id: 92,
  name: "Story motion",
  filename: "story-motion.mp4",
  media_type: "video",
} as VentureAsset

const track = {
  id: "video-track",
  name: "Video",
  media_type: "video",
  visible: true,
  locked: false,
  clips: [],
} as VisualSceneTrack

describe("visual Timeline controls", () => {
  it("repeats an image thumbnail across a long temporal clip without stretching the source", () => {
    const { container } = render(<VisualTimelineClip clip={clip} asset={image} selected={false} trackLocked={false} style={{ width: 480 }} onSelect={vi.fn()} onGesture={vi.fn()} />)

    const placement = screen.getByRole("button", { name: "Story still media clip" })
    expect(placement.className).toContain("is-image")
    const thumbnail = container.querySelector<HTMLElement>(".visual-timeline-thumbnail")
    expect(thumbnail?.querySelector("img")).toBeTruthy()
    expect(thumbnail?.style.backgroundImage).toContain("story-still.png")
  })

  it("exposes linked video audio in the same contextual toolbar", () => {
    const onAudioMute = vi.fn()
    render(<VisualContextToolbar track={track} clip={{ ...clip, asset_id: 92 }} asset={video} saving={false} canSplit={false} hasAudio audioMuted={false} onAudioMute={onAudioMute} onSplit={vi.fn()} onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Mute video audio" }))
    expect(onAudioMute).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Mute video audio" }).textContent).toBe("")
    expect(screen.getByRole("button", { name: "Duplicate media placement" }).textContent).toBe("")
  })

  it("keeps audio truth visible when a video has no audio stream", () => {
    render(<VisualContextToolbar track={track} clip={{ ...clip, asset_id: 92 }} asset={video} saving={false} canSplit={false} onSplit={vi.fn()} onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole("button", { name: "No audio" }).hasAttribute("disabled")).toBe(true)
  })
})
