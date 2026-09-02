// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { WorkspaceFile, VisualSceneDocument } from "@/types/domain"
import { VisualSceneMonitor } from "./visual-scene-monitor"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("VisualSceneMonitor", () => {
  it("aligns a muted video preview to the shared Project playhead and source window", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
    const file = {
      id: 45,
      media_type: "video",
      name: "Harbour move",
      filename: "harbour-original.mov",
      duration_ms: 12_000,
      media_format: "mov",
      video_codec: "prores",
    } as WorkspaceFile
    const document: VisualSceneDocument = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [{
        id: "visual-1",
        name: "Visual 1",
        media_type: "video",
        visible: true,
        locked: false,
        clips: [{ id: "clip-1", file_id: 45, start_ms: 1_000, duration_ms: 8_000, source_offset_ms: 2_000, fit: "contain", position_x: 120, position_y: 40, scale: .75, rotation_degrees: 15, flip_horizontal: true, flip_vertical: false, opacity: .8, locked: false }],
      }],
    }

    render(<VisualSceneMonitor document={document} files={[file]} playheadMs={4_000} playback="playing" />)
    const video = screen.getByLabelText("Harbour move") as HTMLVideoElement
    expect(video.muted).toBe(true)
    expect(video.getAttribute("src")).toBe("/api/v1/media/video-proxy/harbour-original.mov")
    expect(video.getAttribute("poster")).toBe("/api/v1/media/video-poster/harbour-original.mov")
    expect(video.style.transform).toBe("translate(6.25%, 3.7037037037037033%) rotate(15deg) scale(-0.75, 0.75)")
    expect(video.style.transformOrigin).toBe("center center")
    expect(video.style.opacity).toBe("0.8")
    expect(video.style.objectFit).toBe("contain")

    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(5)
    expect(play).toHaveBeenCalled()
  })
})
