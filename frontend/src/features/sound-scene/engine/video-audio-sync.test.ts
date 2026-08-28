import { describe, expect, it, vi } from "vitest"

import type { SoundSceneDocument, VentureAsset, VisualSceneDocument } from "@/types/domain"
import { synchronizeVideoAudio, VIDEO_AUDIO_TRACK_ID, videoHasEmbeddedAudio } from "./video-audio-sync"

const emptySound = (): SoundSceneDocument => ({ version: 1, sequence_overrides: {}, tracks: [] })
const visuals = (clips: VisualSceneDocument["tracks"][number]["clips"]): VisualSceneDocument => ({
  version: 1,
  canvas: { width: 1920, height: 1080 },
  tracks: [{ id: "video-track", name: "Video", media_type: "video", visible: true, locked: false, clips }],
})
const asset = (audio = true): VentureAsset => ({
  id: 7,
  version_id: 11,
  media_type: "video",
  filename: "camera.mov",
  duration_ms: 12_000,
  sample_rate: audio ? 48_000 : null,
  channels: audio ? 2 : null,
  version_metadata: audio ? { audio_codec: "aac" } : {},
})

describe("video audio synchronization", () => {
  it("creates one linked audible placement from video timing without duplicating media", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("10000000-0000-4000-8000-000000000001")
    const result = synchronizeVideoAudio(emptySound(), visuals([{
      id: "20000000-0000-4000-8000-000000000002",
      asset_id: 7,
      start_ms: 2_500,
      duration_ms: 6_000,
      source_offset_ms: 1_200,
      fit: "cover",
      position_x: 0, position_y: 0, scale: 1, opacity: 1,
      locked: false,
    }]), [asset()])

    expect(result.changed).toBe(true)
    expect(result.document.tracks).toHaveLength(1)
    expect(result.document.tracks[0]?.id).toBe(VIDEO_AUDIO_TRACK_ID)
    expect(result.document.tracks[0]?.clips[0]).toMatchObject({
      id: "10000000-0000-4000-8000-000000000001",
      linked_visual_clip_id: "20000000-0000-4000-8000-000000000002",
      asset_id: 7,
      asset_version_id: 11,
      duration_ms: 6_000,
      source_offset_ms: 1_200,
      anchor: { kind: "absolute", position_ms: 2_500 },
    })
  })

  it("follows visual edits while preserving the operator mix decision", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("10000000-0000-4000-8000-000000000001")
    const visualClip = {
      id: "20000000-0000-4000-8000-000000000002",
      asset_id: 7,
      start_ms: 0,
      duration_ms: 6_000,
      source_offset_ms: 0,
      fit: "cover" as const,
      position_x: 0, position_y: 0, scale: 1, opacity: 1,
      locked: false,
    }
    const first = synchronizeVideoAudio(emptySound(), visuals([visualClip]), [asset()]).document
    first.tracks[0]!.clips[0]!.muted = true
    first.tracks[0]!.clips[0]!.gain = .6

    const second = synchronizeVideoAudio(first, visuals([{
      ...visualClip,
      start_ms: 4_000,
      duration_ms: 3_000,
      source_offset_ms: 2_000,
    }]), [asset()]).document
    const clip = second.tracks[0]!.clips[0]!

    expect(clip).toMatchObject({
      muted: true,
      gain: .6,
      duration_ms: 3_000,
      source_offset_ms: 2_000,
      anchor: { kind: "absolute", position_ms: 4_000 },
    })
  })

  it("removes only the linked placement when visual media disappears", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("10000000-0000-4000-8000-000000000001")
    const first = synchronizeVideoAudio(emptySound(), visuals([{
      id: "20000000-0000-4000-8000-000000000002",
      asset_id: 7,
      start_ms: 0,
      duration_ms: 6_000,
      source_offset_ms: 0,
      fit: "cover",
      position_x: 0, position_y: 0, scale: 1, opacity: 1,
      locked: false,
    }]), [asset()]).document
    const second = synchronizeVideoAudio(first, visuals([]), [asset()])

    expect(second.changed).toBe(true)
    expect(second.document.tracks).toEqual([])
  })

  it("does not invent audio for a silent video", () => {
    expect(videoHasEmbeddedAudio(asset(false))).toBe(false)
    expect(synchronizeVideoAudio(emptySound(), visuals([{
      id: "20000000-0000-4000-8000-000000000002",
      asset_id: 7,
      start_ms: 0,
      duration_ms: 6_000,
      source_offset_ms: 0,
      fit: "cover",
      position_x: 0, position_y: 0, scale: 1, opacity: 1,
      locked: false,
    }]), [asset(false)]).document.tracks).toEqual([])
  })
})
