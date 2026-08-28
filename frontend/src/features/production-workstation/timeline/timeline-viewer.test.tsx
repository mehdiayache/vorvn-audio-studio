// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { VentureAsset, VisualSceneDocument } from "@/types/domain"
import { TimelineViewer } from "./timeline-viewer"

afterEach(cleanup)

describe("TimelineViewer", () => {
  it("keeps the production format in the left viewer without exposing clip fit mechanics", () => {
    const setCanvas = vi.fn()
    const document: VisualSceneDocument = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [{ id: "image-track", name: "Image 1", media_type: "image", visible: true, locked: false, clips: [{ id: "image-clip", asset_id: 8, start_ms: 0, duration_ms: 5_000, source_offset_ms: 0, fit: "cover", position_x: 0, position_y: 0, scale: 1, opacity: 1, locked: false }] }],
    }
    const asset = { id: 8, media_type: "image", name: "Harbour", filename: "harbour.jpg", width: 1920, height: 1080 } as VentureAsset
    const session = { setCanvas } as unknown as VisualSceneSession

    render(<TimelineViewer document={document} assets={[asset]} playheadMs={0} playback="idle" selection={{ trackId: "image-track", clipId: "image-clip" }} session={session} saving={false} />)

    expect((screen.getByLabelText("Visual monitor").firstElementChild as HTMLElement).style.getPropertyValue("--visual-scene-aspect")).toBe("1.7777777777777777")
    fireEvent.pointerDown(screen.getByRole("button", { name: "Production format 16:9" }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /9:16/ }))
    expect(setCanvas).toHaveBeenCalledWith(1080, 1920)
    expect(screen.queryByText("Fit entire media")).toBeNull()
    expect(screen.queryByText("Fill and crop")).toBeNull()
  })

  it("publishes the exact portrait aspect used by the responsive Viewer fit", () => {
    const document: VisualSceneDocument = { version: 1, canvas: { width: 1080, height: 1920 }, tracks: [] }
    const session = { setCanvas: vi.fn() } as unknown as VisualSceneSession
    render(<TimelineViewer document={document} assets={[]} playheadMs={0} playback="idle" selection={null} session={session} saving={false} />)

    const frame = screen.getByLabelText("Visual monitor").firstElementChild as HTMLElement
    expect(frame.style.aspectRatio).toBe("1080 / 1920")
    expect(frame.style.getPropertyValue("--visual-scene-aspect")).toBe("0.5625")
  })

  it("keeps Viewer controls inside the Viewer and collapses to a recoverable rail", () => {
    const onCollapsedChange = vi.fn()
    const document: VisualSceneDocument = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [],
    }
    const session = { setCanvas: vi.fn() } as unknown as VisualSceneSession
    const { rerender } = render(<TimelineViewer document={document} assets={[]} playheadMs={0} playback="idle" selection={null} session={session} saving={false} onCollapsedChange={onCollapsedChange} onAddMedia={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Hide Viewer" }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)

    rerender(<TimelineViewer document={document} assets={[]} playheadMs={0} playback="idle" selection={null} session={session} saving={false} collapsed onCollapsedChange={onCollapsedChange} onAddMedia={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Show Viewer" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Production format/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Add visual at playhead" })).toBeNull()
  })
})
