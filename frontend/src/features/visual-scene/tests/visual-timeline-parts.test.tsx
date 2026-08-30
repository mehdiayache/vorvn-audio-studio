// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"
import { VisualContextToolbar, VisualTimelineClip, VisualTrackControl } from "../timeline/visual-timeline-parts"

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

beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    const onAudioVolume = vi.fn()
    render(<VisualContextToolbar track={track} clip={{ ...clip, asset_id: 92 }} asset={video} saving={false} canSplit={false} hasAudio audioGain={1} audioMuted={false} onAudioVolume={onAudioVolume} onSplit={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Video volume · 100%" }))
    fireEvent.click(screen.getByRole("button", { name: "Mute Video volume" }))
    expect(onAudioVolume).toHaveBeenCalledWith({ gain: 1, muted: true })
    expect(screen.getByRole("button", { name: "Duplicate media placement" }).textContent).toBe("")
  })

  it("keeps unavailable audio out and owns the single-placement lock action", () => {
    const onLock = vi.fn()
    const { container } = render(<VisualContextToolbar track={track} clip={{ ...clip, asset_id: 92 }} asset={video} saving={false} canSplit={false} onSplit={vi.fn()} onLock={onLock} onDuplicate={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.queryByRole("button", { name: "No audio" })).toBeNull()
    const lock = screen.getByRole("button", { name: "Lock media placement" })
    expect(lock.querySelector(".lucide-lock-open")).toBeTruthy()
    fireEvent.click(lock)
    expect(onLock).toHaveBeenCalledOnce()
    expect(container.querySelector(".visual-context-identity")?.textContent).toContain("Video clip")
  })

  it("shows the locked state while keeping unlock available in the selection bar", () => {
    const { container } = render(<VisualContextToolbar track={track} clip={{ ...clip, locked: true }} asset={image} saving={false} canSplit={false} selectionLocked onSplit={vi.fn()} onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />)

    const unlock = screen.getByRole("button", { name: "Unlock media placement" })
    expect(unlock.className).toContain("is-locked")
    expect(unlock.querySelector(".lucide-lock")).toBeTruthy()
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Remove media placement"]')?.disabled).toBe(true)
  })

  it("keeps batch locking available when multiple placements are selected", () => {
    const onLock = vi.fn()
    render(<VisualContextToolbar count={2} track={track} clip={clip} asset={video} saving={false} canSplit={false} selectionLocked={false} onSplit={vi.fn()} onLock={onLock} onDuplicate={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Lock selected media" }))
    expect(onLock).toHaveBeenCalledOnce()
  })

  it("shows locked placement status inside the clip label", () => {
    render(<VisualTimelineClip clip={{ ...clip, locked: true }} asset={video} selected trackLocked={false} style={{ width: 160 }} onSelect={vi.fn()} onGesture={vi.fn()} />)

    expect(screen.getByLabelText("Locked placement")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Resize media start" })).toBeNull()
  })

  it("uses lock icons as track state instead of contradictory actions", () => {
    const props = { assets: [video], collapsed: false, first: true, last: true, onVisible: vi.fn(), onLocked: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onRename: vi.fn(), onRemove: vi.fn() }
    const { container, rerender } = render(<VisualTrackControl {...props} track={track} />)

    expect(screen.getByRole("button", { name: "Lock Video" }).querySelector(".lucide-lock-open")).toBeTruthy()
    rerender(<VisualTrackControl {...props} track={{ ...track, locked: true }} />)
    const unlock = screen.getByRole("button", { name: "Unlock Video" })
    expect(unlock.querySelector(".lucide-lock")).toBeTruthy()
    expect(unlock.className).toContain("is-active")
    expect(container.querySelector(".visual-track-control")?.className).toContain("is-locked")
  })
})
