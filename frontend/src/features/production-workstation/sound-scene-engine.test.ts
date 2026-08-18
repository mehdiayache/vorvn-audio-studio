import { describe, expect, it, vi } from "vitest"

import type { SoundScene } from "@/types/domain"
import { SoundSceneEngine } from "./sound-scene-engine"
import { SoundSceneSession } from "./sound-scene-session"

const clipId = "78af885c-aeb4-49bf-9edb-d3fc14496b2c"

function scene(): SoundScene {
  const clip = { id: clipId, asset_id: 9, start_ms: 0, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, anchor: { kind: "absolute" as const, position_ms: 0 }, asset_name: "Night bed", filename: "bed.mp3", source_duration_ms: 60_000, resolved_start_ms: 0, resolved_duration_ms: 10_000 }
  const track = { id: "music", kind: "music" as const, name: "Music", volume: 1, muted: false, clips: [clip] }
  return { production_id: 6, revision: 1, document: { version: 1, tracks: [track] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", sequence_projection: { signature: "sequence", duration_ms: 10_000, sample_rate: 48_000, spans: [{ part_id: 7, part_public_id: "part-7", position: 0, kind: "speech", title: "Opening", role: "Narrator", voice_name: "Eva", filename: "opening.mp3", start_ms: 0, duration_ms: 10_000, silence: false, missing: false }] }, tracks: [track], orphans: [] }, sequence_stem: { url: "/audio/stem.mp3", filename: "stem.mp3", duration_ms: 10_000, signature: "sequence", cached: true } }
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
    editor.setClipValue("music", clipId, { gain: .35, fade_in_ms: 900, fade_out_ms: 1_400, loop: false })
    editor.setTrackMute("music", true)
    editor.setTrackVolume("music", .7)
    const document = editor.document()
    const clip = document.tracks[0]!.clips[0]!
    expect(document.tracks[0]!.muted).toBe(true)
    expect(document.tracks[0]!.volume).toBe(.7)
    expect({ gain: clip.gain, fadeIn: clip.fade_in_ms, fadeOut: clip.fade_out_ms, loop: clip.loop }).toEqual({ gain: .35, fadeIn: 900, fadeOut: 1_400, loop: false })
    editor.dispose()
  })
})

describe("SoundSceneSession", () => {
  it("applies gain to live playout during drag and persists exactly once on release", async () => {
    const source = scene()
    const update = vi.fn().mockResolvedValue({ ...source, revision: 2 })
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update, undo: vi.fn().mockResolvedValue(source),
      redo: vi.fn().mockResolvedValue(source),
    }, playout)

    session.updateClip("music", clipId, { gain: .42 })
    expect(playout.setClipGain).toHaveBeenCalledWith("music", clipId, .42)
    expect(update).not.toHaveBeenCalled()

    await session.commitClip()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]![0].tracks[0].clips[0].gain).toBe(.42)
    session.dispose()
  })

  it("keeps track volume distinct from clip gain", async () => {
    const source = scene()
    const update = vi.fn().mockResolvedValue({ ...source, revision: 2 })
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update, undo: vi.fn().mockResolvedValue(source),
      redo: vi.fn().mockResolvedValue(source),
    }, playout)

    session.setTrackVolume("music", .65)
    expect(playout.setTrackVolume).toHaveBeenCalledWith("music", .65)
    expect(update).not.toHaveBeenCalled()
    await session.commitTrackVolume("music", .65)
    expect(update.mock.calls[0]![0].tracks[0].volume).toBe(.65)
    expect(update.mock.calls[0]![0].tracks[0].clips[0].gain).toBe(.1)
    session.dispose()
  })
})
