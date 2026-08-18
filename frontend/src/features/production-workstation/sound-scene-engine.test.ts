import { describe, expect, it } from "vitest"

import type { SoundScene } from "@/types/domain"
import { SoundSceneEngine } from "./sound-scene-engine"

const clipId = "78af885c-aeb4-49bf-9edb-d3fc14496b2c"

function scene(): SoundScene {
  const clip = { id: clipId, asset_id: 9, start_ms: 0, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, anchor: { kind: "absolute" as const, position_ms: 0 }, asset_name: "Night bed", filename: "bed.mp3", source_duration_ms: 60_000, resolved_start_ms: 0, resolved_duration_ms: 10_000 }
  const track = { id: "music", kind: "music" as const, name: "Music", muted: false, clips: [clip] }
  return { production_id: 6, revision: 1, document: { version: 1, tracks: [track] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", voice_projection: { signature: "voice", duration_ms: 10_000, sample_rate: 48_000, spans: [{ part_id: 7, part_public_id: "part-7", position: 0, kind: "speech", title: "Opening", role: "Narrator", voice_name: "Eva", filename: "opening.mp3", start_ms: 0, duration_ms: 10_000, silence: false, missing: false }] }, tracks: [track], orphans: [] }, voice_stem: { url: "/audio/stem.mp3", filename: "stem.mp3", duration_ms: 10_000, signature: "voice", cached: true } }
}

describe("SoundSceneEngine", () => {
  it("maps native move and trim operations back to the persisted scene contract", () => {
    const editor = new SoundSceneEngine(scene())
    editor.beginGesture()
    editor.moveClip("music", clipId, 48_000)
    editor.trimClip("music", clipId, "left", 24_000)
    editor.commitGesture()

    const clip = editor.document().tracks[0]!.clips[0]!
    expect(clip.start_ms).toBe(1_500)
    expect(clip.source_offset_ms).toBe(500)
    expect(clip.duration_ms).toBe(9_500)
    expect(clip.anchor).toEqual({ kind: "absolute", position_ms: 1_500 })
    editor.dispose()
  })

  it("keeps gain, fades, loop and track mute in one document", () => {
    const editor = new SoundSceneEngine(scene())
    editor.setClipValue("music", clipId, { gain: .35, fadeInMs: 900, fadeOutMs: 1_400 })
    editor.setTrackMute("music", true)
    const document = editor.document({ [clipId]: { loop: false } })
    const clip = document.tracks[0]!.clips[0]!
    expect(document.tracks[0]!.muted).toBe(true)
    expect({ gain: clip.gain, fadeIn: clip.fade_in_ms, fadeOut: clip.fade_out_ms, loop: clip.loop }).toEqual({ gain: .35, fadeIn: 900, fadeOut: 1_400, loop: false })
    editor.dispose()
  })
})
