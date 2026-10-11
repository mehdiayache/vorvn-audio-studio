// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VisualContextToolbar, VisualTimelineClip, VisualTrackControl } from "./visual-timeline-parts"
import { VisualTimelineSection } from "./visual-timeline-section"
import type { VisualSceneClip, VisualSceneTrack, WorkspaceFile } from "./studio-timeline-model"

const clip: VisualSceneClip = { id: "clip", file_id: "pin:version4", start_ms: 2000, duration_ms: 12000, source_offset_ms: 0, fit: "cover", position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }
const file: WorkspaceFile = { id: "pin:version4", name: "Pinned frame", media_type: "image", url: "https://authorized.example/version4.png" }
const track: VisualSceneTrack = { id: "track", name: "Story", media_type: "image", visible: true, locked: false, clips: [clip] }
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("actual shared Studio visual presentation", () => {
  it("uses only host URLs and avoids toggling the same pointer selection twice", () => {
    const onSelect = vi.fn(), onGesture = vi.fn()
    const { container } = render(<VisualTimelineClip clip={clip} file={file} selected trackLocked={false} style={{ width: 400 }} onSelect={onSelect} onGesture={onGesture} />)
    const target = screen.getByRole("button", { name: "Pinned frame media clip" })
    expect(container.querySelector("img")?.getAttribute("src")).toBe(file.url)
    fireEvent.pointerDown(target)
    fireEvent.click(target, { detail: 1, shiftKey: true })
    expect(onGesture).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(target, { key: "Enter" })
    expect(onSelect).toHaveBeenCalledOnce()
    fireEvent.keyDown(target, { key: " " })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(target.getAttribute("data-timeline-shortcut-surface")).toBe("true")
  })

  it("allows readonly selection while hiding all trim gestures", () => {
    const onSelect = vi.fn(), onGesture = vi.fn()
    render(<VisualTimelineClip clip={clip} file={file} selected editable={false} trackLocked={false} style={{}} onSelect={onSelect} onGesture={onGesture} />)
    const target = screen.getByRole("button", { name: "Pinned frame media clip" })
    fireEvent.pointerDown(target)
    fireEvent.click(target, { detail: 1 })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onGesture).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Resize media start" })).toBeNull()
  })

  it("disables source mutation controls but keeps the track identity visible", () => {
    const onVisible = vi.fn(), onAdd = vi.fn()
    render(<VisualTrackControl track={track} files={[file]} collapsed={false} disabled first last onVisible={onVisible} onLocked={vi.fn()} onAdd={onAdd} onMove={vi.fn()} onRename={vi.fn()} onRemove={vi.fn()} />)
    const hide = screen.getByRole("button", { name: "Hide Story" }) as HTMLButtonElement
    expect(hide.disabled).toBe(true)
    fireEvent.click(hide)
    expect(onVisible).not.toHaveBeenCalled()
    expect((screen.getByRole("button", { name: "Actions for Story" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("Story")).toBeTruthy()
  })

  it("keeps duplicate and delete unavailable for a locked selection", () => {
    const onDuplicate = vi.fn(), onDelete = vi.fn()
    render(<VisualContextToolbar track={track} clip={{ ...clip, locked: true }} file={file} saving={false} canSplit={false} onSplit={vi.fn()} onLock={vi.fn()} onDuplicate={onDuplicate} onDelete={onDelete} />)
    expect((screen.getByRole("button", { name: "Duplicate media placement" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Remove media placement" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Unlock media placement" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("keeps empty-track creation unavailable for readonly or locked tracks", () => {
    const onAdd = vi.fn()
    const props = { files: [file], selection: [], styleFor: () => ({}), onSelect: vi.fn(), onGesture: vi.fn(), onAdd, onPan: vi.fn() }
    const { rerender } = render(<VisualTimelineSection {...props} tracks={[{ ...track, clips: [] }]} editable={false} />)
    expect((screen.getByRole("button", { name: "Add media" }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<VisualTimelineSection {...props} tracks={[{ ...track, locked: true, clips: [] }]} />)
    expect((screen.getByRole("button", { name: "Add media" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
