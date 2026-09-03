// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"
import { TimelinePreview } from "./timeline-viewer"

afterEach(cleanup)

describe("TimelinePreview", () => {
  it("keeps the production format in Timeline Preview without exposing clip fit mechanics", () => {
    const setCanvas = vi.fn()
    const document: VisualSceneDocument = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [{ id: "image-track", name: "Image 1", media_type: "image", visible: true, locked: false, clips: [{ id: "image-clip", file_id: 8, start_ms: 0, duration_ms: 5_000, source_offset_ms: 0, fit: "cover", position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }] }],
    }
    const file = { id: 8, media_type: "image", name: "Harbour", filename: "harbour.jpg", width: 1920, height: 1080 } as WorkspaceFile
    const session = { setCanvas } as unknown as VisualSceneSession

    render(<TimelinePreview document={document} files={[file]} playheadMs={0} playback="idle" selection={{ trackId: "image-track", clipId: "image-clip" }} session={session} saving={false} transport={<span>Transport</span>} />)

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
    render(<TimelinePreview document={document} files={[]} playheadMs={0} playback="idle" selection={null} session={session} saving={false} transport={<span>Transport</span>} />)

    const frame = screen.getByLabelText("Visual monitor").firstElementChild as HTMLElement
    expect(frame.style.aspectRatio).toBe("1080 / 1920")
    expect(frame.style.getPropertyValue("--visual-scene-aspect")).toBe("0.5625")
  })

  it("keeps Timeline Preview controls inside a stable pane", () => {
    const document: VisualSceneDocument = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [],
    }
    const session = { setCanvas: vi.fn() } as unknown as VisualSceneSession
    render(<TimelinePreview document={document} files={[]} playheadMs={0} playback="idle" selection={null} session={session} saving={false} transport={<span>Transport</span>} />)

    expect(screen.getByLabelText("Timeline Preview")).toBeTruthy()
    expect(screen.getByText("Preview")).toBeTruthy()
    expect(screen.getByLabelText("Timeline Preview canvas controls")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Production format/ })).toBeTruthy()
    expect(screen.getByLabelText("Timeline Preview transport")).toBeTruthy()
    expect(screen.getByText("Transport")).toBeTruthy()
    expect(screen.getByText("timeline")).toBeTruthy()
  })

  it("zooms the Timeline Preview viewport without changing clip framing", () => {
    const document: VisualSceneDocument = { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [] }
    const session = { setCanvas: vi.fn() } as unknown as VisualSceneSession
    const { container } = render(<TimelinePreview document={document} files={[]} playheadMs={0} playback="idle" selection={null} session={session} saving={false} transport={<span>Transport</span>} />)

    expect(screen.getByRole("button", { name: "Pan Timeline Preview canvas" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Zoom Timeline Preview in" }))
    expect(screen.getByText("125%")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pan Timeline Preview canvas" }).hasAttribute("disabled")).toBe(false)
    expect((container.querySelector(".timeline-viewer-stage") as HTMLElement).style.getPropertyValue("--preview-zoom")).toBe("1.25")

    fireEvent.click(screen.getAllByRole("button", { name: "Fit Timeline Preview canvas" })[0]!)
    expect(screen.getByText("Fit")).toBeTruthy()
    expect((container.querySelector(".timeline-viewer-stage") as HTMLElement).style.getPropertyValue("--preview-zoom")).toBe("1")
  })
})
