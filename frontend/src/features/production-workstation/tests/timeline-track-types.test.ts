import { describe, expect, it } from "vitest"

import { soundTrackDisplayName } from "@/features/sound-scene/engine/sound-scene-session"
import { visualTrackDisplayName } from "@/features/visual-scene/timeline/visual-timeline-parts"
import type { SoundSceneTrack, VentureAsset, VisualSceneTrack } from "@/types/domain"

const visualTrack = (name: string, assetIds: number[], mediaType: "image" | "video" = "image"): VisualSceneTrack => ({
  id: `visual-${name}`,
  name,
  media_type: mediaType,
  visible: true,
  locked: false,
  clips: assetIds.map((assetId, index) => ({
    id: `clip-${assetId}-${index}`,
    asset_id: assetId,
    start_ms: index * 1_000,
    duration_ms: 1_000,
    source_offset_ms: 0,
    fit: "cover",
    locked: false,
  })),
})

const assets = [
  { id: 1, media_type: "image", name: "Still" },
  { id: 2, media_type: "video", name: "Motion" },
] as VentureAsset[]

const audioTrack = (kinds: string[], name = "Operator custom name"): SoundSceneTrack => ({
  id: "audio-track",
  kind: "audio",
  name,
  volume: 1,
  muted: false,
  clips: kinds.map((kind, index) => ({
    id: `audio-${index}`,
    asset_id: index + 1,
    asset_kind: kind,
    duration_ms: 1_000,
    source_offset_ms: 0,
    gain: 1,
    fade_in_ms: 0,
    fade_out_ms: 0,
    loop: false,
    ducking: false,
    duck_amount_db: -12,
    muted: false,
    locked: false,
    effects: [],
    anchor: { kind: "absolute", position_ms: 0 },
  })),
})

describe("Timeline track type labels", () => {
  it("labels visual tracks by their canonical type, including repeated types", () => {
    expect(visualTrackDisplayName(visualTrack("Visual 1", [1]), assets)).toBe("Image")
    expect(visualTrackDisplayName(visualTrack("Visual 2", [1]), assets)).toBe("Image")
    expect(visualTrackDisplayName(visualTrack("Visual 3", [2], "video"), assets)).toBe("Video")
  })

  it("preserves the chosen type for an empty visual track", () => {
    expect(visualTrackDisplayName(visualTrack("Image", []), assets)).toBe("Image")
    expect(visualTrackDisplayName(visualTrack("Video", [], "video"), assets)).toBe("Video")
  })

  it("labels audio tracks from canonical clip categories instead of filenames", () => {
    expect(soundTrackDisplayName(audioTrack(["music"]))).toBe("Music")
    expect(soundTrackDisplayName(audioTrack(["sfx"]))).toBe("SFX")
    expect(soundTrackDisplayName(audioTrack(["ambience"]))).toBe("Ambience")
    expect(soundTrackDisplayName(audioTrack(["intro"]))).toBe("Intro")
    expect(soundTrackDisplayName(audioTrack(["outro"]))).toBe("Outro")
    expect(soundTrackDisplayName(audioTrack(["music", "sfx"]))).toBe("Audio")
    expect(soundTrackDisplayName({
      ...audioTrack(["other"]),
      clips: [{ ...audioTrack(["other"]).clips[0]!, source_media_type: "video" }],
    })).toBe("Video audio")
  })
})
