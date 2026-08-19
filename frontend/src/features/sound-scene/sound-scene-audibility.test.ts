import { describe, expect, it } from "vitest"

import type { SoundScene, SoundSceneTrack } from "@/types/domain"
import { audibleMusicClips } from "./sound-scene-audibility"

function scene(tracks: SoundSceneTrack[]): SoundScene {
  return {
    production_id: 1,
    revision: 1,
    document: { version: 1, tracks },
    can_undo: false,
    can_redo: false,
    updated_at: "2026-08-19",
    resolved: {
      version: 1,
      signature: "scene",
      duration_ms: 1_000,
      sequence_projection: { signature: "sequence", duration_ms: 1_000, sample_rate: 48_000, spans: [] },
      tracks,
      orphans: [],
    },
    sequence_stem: { url: "", filename: "", duration_ms: 1_000, signature: "sequence", cached: true },
  }
}

function music(id: string, options: Partial<SoundSceneTrack> = {}): SoundSceneTrack {
  return {
    id,
    kind: "music",
    name: id,
    volume: 1,
    muted: false,
    clips: [{
      id: `${id}-clip`, asset_id: 1, start_ms: 0, duration_ms: 1_000,
      source_offset_ms: 0, gain: 1, fade_in_ms: 0, fade_out_ms: 0,
      loop: false, ducking: false,
      anchor: { kind: "absolute", position_ms: 0 }, resolved_duration_ms: 1_000,
    }],
    ...options,
  }
}

describe("audibleMusicClips", () => {
  it("aggregates every audible Music track and ignores muted or empty tracks", () => {
    const empty = music("Music 1", { clips: [] })
    const muted = music("Music 2", { muted: true })
    const silentTrack = music("Music muted by volume", { volume: 0 })
    const silentClip = music("Music muted by gain")
    silentClip.clips[0]!.gain = 0
    const missingClip = music("Missing Music")
    missingClip.clips[0]!.missing = true
    const active = music("Music 3")
    active.clips.push({ ...active.clips[0]!, id: "Music 3-second-clip" })

    expect(audibleMusicClips(scene([
      empty, muted, silentTrack, silentClip, missingClip, active,
    ])).map((clip) => clip.id)).toEqual([
      "Music 3-clip",
      "Music 3-second-clip",
    ])
  })
})
