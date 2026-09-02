import { describe, expect, it } from "vitest"

import type { SoundScene, VisualSceneDocument } from "@/types/domain"
import { projectTimelineDurationMs } from "./timeline-duration"

describe("projectTimelineDurationMs", () => {
  it("uses the latest canonical endpoint across Script, sound and visuals", () => {
    const sound = { resolved: { duration_ms: 8_000, sequence_projection: { duration_ms: 6_000 } } } as SoundScene
    const visual = {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      tracks: [{ id: "video", name: "Video 1", media_type: "video", visible: true, locked: false, clips: [{ id: "clip", file_id: 1, start_ms: 7_000, duration_ms: 5_000, source_offset_ms: 0, fit: "cover", position_x: 0, position_y: 0, scale: 1, opacity: 1, locked: false }] }],
    } as VisualSceneDocument
    expect(projectTimelineDurationMs(sound, visual)).toBe(12_000)
  })
})
