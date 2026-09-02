import { describe, expect, it } from "vitest"

import type { SequenceProjectionSpan, SoundSceneTrack, WorkspaceFile, VisualSceneTrack } from "@/types/domain"
import { resolveWorkstationSelection } from "./workstation-selection"

const audioTrack = {
  id: "audio-1", name: "Music", kind: "audio", role: "music", volume: 1, muted: false,
  clips: [{ id: "audio-clip", file_id: 2, file_name: "Theme", filename: "theme.wav" }],
} as SoundSceneTrack
const visualTrack = {
  id: "visual-1", name: "Video", media_type: "video", visible: true, locked: false,
  clips: [{ id: "visual-clip", file_id: 1, start_ms: 0, duration_ms: 5_000 }],
} as VisualSceneTrack
const files = [{ id: 1, media_type: "video", name: "Scene" }, { id: 2, media_type: "audio", name: "Theme" }] as WorkspaceFile[]
const span = { part_id: 3, part_public_id: "part", title: "Intro" } as SequenceProjectionSpan

describe("resolveWorkstationSelection", () => {
  it("adapts a visual placement without copying selection ownership", () => {
    const selection = resolveWorkstationSelection({
      soundSelection: null,
      visualSelection: { trackId: "visual-1", clipId: "visual-clip" },
      soundTracks: [audioTrack], visualTracks: [visualTrack], spans: [span], files,
    })
    expect(selection?.kind).toBe("visual-placement")
    if (selection?.kind !== "visual-placement") throw new Error("Expected visual selection")
    expect(selection.primary.file?.name).toBe("Scene")
  })

  it("adapts audio multi-selection and preserves its primary placement", () => {
    const selection = resolveWorkstationSelection({
      soundSelection: { kind: "clip", trackId: "audio-1", clipId: "audio-clip" },
      visualSelection: null,
      soundTracks: [audioTrack], visualTracks: [visualTrack], spans: [span], files,
    })
    expect(selection?.kind).toBe("audio-placement")
    if (selection?.kind !== "audio-placement") throw new Error("Expected audio selection")
    expect(selection.primary.track.name).toBe("Music")
  })

  it("adapts canonical Script audio and ignores stale identifiers", () => {
    expect(resolveWorkstationSelection({ soundSelection: { kind: "part", id: 3 }, visualSelection: null, soundTracks: [], visualTracks: [], spans: [span], files: [] })).toEqual({ kind: "script-part", span })
    expect(resolveWorkstationSelection({ soundSelection: { kind: "part", id: 999 }, visualSelection: null, soundTracks: [], visualTracks: [], spans: [span], files: [] })).toBeNull()
  })

  it("gives a valid visual selection precedence during a transient handoff", () => {
    const selection = resolveWorkstationSelection({
      soundSelection: { kind: "clip", trackId: "audio-1", clipId: "audio-clip" },
      visualSelection: { trackId: "visual-1", clipId: "visual-clip" },
      soundTracks: [audioTrack], visualTracks: [visualTrack], spans: [span], files,
    })
    expect(selection?.kind).toBe("visual-placement")
  })
})
