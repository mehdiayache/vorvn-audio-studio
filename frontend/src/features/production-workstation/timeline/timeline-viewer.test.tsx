// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { VentureAsset, VisualSceneDocument } from "@/types/domain"
import { TimelineViewer } from "./timeline-viewer"

afterEach(cleanup)

describe("TimelineViewer", () => {
  it("changes canonical output framing and selected clip fit", () => {
    const setCanvas = vi.fn()
    const setClipFit = vi.fn()
    const document: VisualSceneDocument = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [{ id: "image-track", name: "Image", media_type: "image", visible: true, locked: false, clips: [{ id: "image-clip", asset_id: 8, start_ms: 0, duration_ms: 5_000, source_offset_ms: 0, fit: "cover", locked: false }] }],
    }
    const asset = { id: 8, media_type: "image", name: "Harbour", filename: "harbour.jpg", width: 1920, height: 1080 } as VentureAsset
    const session = { setCanvas, setClipFit } as unknown as VisualSceneSession

    render(<TimelineViewer document={document} assets={[asset]} playheadMs={0} playback="idle" selection={{ trackId: "image-track", clipId: "image-clip" }} session={session} saving={false} />)

    fireEvent.click(screen.getByRole("radio", { name: "9:16 output frame" }))
    expect(setCanvas).toHaveBeenCalledWith(1080, 1920)
    fireEvent.click(screen.getByRole("radio", { name: "Fit entire media in frame" }))
    expect(setClipFit).toHaveBeenCalledWith({ trackId: "image-track", clipId: "image-clip" }, "contain")
  })
})
