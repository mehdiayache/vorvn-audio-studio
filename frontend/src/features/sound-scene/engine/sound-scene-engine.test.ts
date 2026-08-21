import { describe, expect, it, vi } from "vitest"

import type { SoundScene } from "@/types/domain"
import { SOUND_SCENE_ZOOM_LEVELS, SoundSceneEngine, soundSceneFitZoomIndex, soundSceneZoomIndex, soundSceneZoomLevel } from "./sound-scene-engine"
import { SoundSceneSession } from "./sound-scene-session"

const clipId = "78af885c-aeb4-49bf-9edb-d3fc14496b2c"

function scene(): SoundScene {
  const mix = { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] }
  const clip = { id: clipId, asset_id: 9, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, muted: false, locked: false, effects: [], anchor: { kind: "absolute" as const, position_ms: 0 }, asset_name: "Night bed", filename: "bed.mp3", source_duration_ms: 60_000, resolved_start_ms: 0, resolved_duration_ms: 10_000 }
  const track = { id: "music", kind: "music" as const, name: "Music", volume: 1, muted: false, clips: [clip] }
  return { production_id: 6, revision: 1, document: { version: 1, sequence_overrides: {}, tracks: [track] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", duration_ms: 10_000, sequence_projection: { signature: "sequence", duration_ms: 10_000, sample_rate: 48_000, spans: [{ part_id: 7, part_public_id: "part-7", position: 0, kind: "speech", title: "Opening", role: "Narrator", voice_name: "Eva", filename: "opening.mp3", start_ms: 0, duration_ms: 10_000, silence: false, missing: false, mix }] }, tracks: [track], orphans: [] }, sequence_stem: { url: "/audio/stem.mp3", filename: "stem.mp3", duration_ms: 10_000, signature: "sequence", cached: true } }
}

describe("SoundSceneEngine", () => {
  it("maps native move and trim operations back to the persisted scene contract", () => {
    const editor = new SoundSceneEngine(scene())
    editor.beginGesture()
    editor.moveClip("music", clipId, 48_000)
    editor.trimClip("music", clipId, "left", 24_000)
    editor.commitGesture()

    const clip = editor.document().tracks[0]!.clips[0]!
    expect(clip).not.toHaveProperty("start_ms")
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

  it("increases timeline detail when zooming in", () => {
    const editor = new SoundSceneEngine(scene())
    const initial = editor.state().samplesPerPixel
    editor.zoomIn()
    expect(editor.state().samplesPerPixel).toBeLessThan(initial)
    editor.zoomOut()
    expect(editor.state().samplesPerPixel).toBe(initial)
    editor.dispose()
  })

  it("uses one dense zoom scale for slider, buttons and engine state", () => {
    const editor = new SoundSceneEngine(scene())
    const initial = editor.state().samplesPerPixel
    const initialIndex = soundSceneZoomIndex(initial)
    const next = soundSceneZoomLevel(initialIndex + 1)

    expect(SOUND_SCENE_ZOOM_LEVELS.length).toBeGreaterThan(20)
    expect((initial - next) / initial).toBeLessThan(.2)
    editor.setZoomLevel(next)
    expect(soundSceneZoomIndex(editor.state().samplesPerPixel)).toBe(initialIndex + 1)
    editor.dispose()
  })

  it("fits a long Production inside the actual timeline viewport", () => {
    const viewport = 1_040
    const duration = 7 * 60 + 21
    const samplesPerPixel = soundSceneZoomLevel(soundSceneFitZoomIndex(duration, viewport))

    expect(duration * 48_000 / samplesPerPixel).toBeLessThanOrEqual(viewport)
    expect(duration * 48_000 / soundSceneZoomLevel(soundSceneFitZoomIndex(duration, 700))).toBeLessThanOrEqual(700)
  })

  it("enforces clip lock below the UI gesture layer", () => {
    const source = scene()
    source.document.tracks[0]!.clips[0]!.locked = true
    source.resolved.tracks[0]!.clips[0]!.locked = true
    const editor = new SoundSceneEngine(source)

    expect(editor.moveClip("music", clipId, 48_000)).toBe(false)
    expect(editor.trimClip("music", clipId, "right", -24_000)).toBe(false)
    expect(editor.document().tracks[0]!.clips[0]!.anchor).toEqual({ kind: "absolute", position_ms: 0 })
    expect(editor.document().tracks[0]!.clips[0]!.duration_ms).toBeNull()
    editor.dispose()
  })
})

describe("SoundSceneSession", () => {
  it("adds another Music track without replacing the existing placement", async () => {
    const source = scene()
    const update = vi.fn().mockResolvedValue({ ...source, revision: 2 })
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    await session.addTrack("music", { id: 22, title: "Outro", duration_ms: 8_000 }, 3)

    const document = update.mock.calls[0]![0]
    expect(document.tracks).toHaveLength(2)
    expect(document.tracks[0].clips[0].asset_id).toBe(9)
    expect(document.tracks[1].clips[0].asset_id).toBe(22)
    expect(document.tracks[1].clips[0].anchor.position_ms).toBe(3_000)
    session.dispose()
  })

  it("keeps the playing state while a changed Sequence is prepared", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(7))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const source = scene()
    let resolveReplace!: () => void
    const replacement = new Promise<void>((resolve) => { resolveReplace = resolve })
    const playout = {
      replace: vi.fn().mockReturnValue(replacement), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(2),
      isPlaying: vi.fn().mockReturnValue(true), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update: vi.fn().mockResolvedValue(source), undo: vi.fn().mockResolvedValue(source),
      redo: vi.fn().mockResolvedValue(source),
    }, playout)

    await session.togglePlayback()
    const changed = {
      ...source,
      revision: 2,
      resolved: { ...source.resolved, signature: "changed-scene" },
    }
    session.reconcile(changed)
    expect(session.snapshot().playing).toBe(true)
    resolveReplace()
    await replacement
    await Promise.resolve()
    expect(session.snapshot().playing).toBe(true)
    expect(session.snapshot().playhead).toBe(2)
    session.dispose()
    vi.unstubAllGlobals()
  })

  it("never exposes a playhead outside the canonical Scene duration", () => {
    const source = scene()
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(42),
      isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    }, playout)

    session.pause()

    expect(session.snapshot().playhead).toBe(10)
    session.dispose()
  })

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

  it("duplicates a multi-track group after itself while preserving relative Part anchors", async () => {
    const source = scene()
    const second = structuredClone(source.document.tracks[0]!.clips[0]!)
    second.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    second.anchor = { kind: "part", part_public_id: "part-7", edge: "end", offset_ms: 500 }
    second.duration_ms = 2_000
    delete second.resolved_start_ms
    delete second.resolved_duration_ms
    source.document.tracks.push({ id: "music-2", kind: "music", name: "Music 2", volume: 1, muted: false, clips: [second] })
    source.resolved.tracks.push({
      ...source.document.tracks[1]!,
      clips: [{ ...second, resolved_start_ms: 10_500, resolved_duration_ms: 2_000 }],
    })
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    session.selectClip("music", clipId)
    session.selectClip("music-2", second.id, true)
    await session.duplicateClips()

    const document = update.mock.calls[0]![0]
    expect(document.tracks[0].clips).toHaveLength(2)
    expect(document.tracks[1].clips).toHaveLength(2)
    expect(document.tracks[0].clips[1].anchor).toEqual({ kind: "absolute", position_ms: 12_500 })
    expect(document.tracks[1].clips[1].anchor).toEqual({ kind: "part", part_public_id: "part-7", edge: "end", offset_ms: 13_000 })
    expect(session.snapshot().selection?.kind).toBe("clips")
    session.dispose()
  })

  it("moves a multi-track selection in one persisted transaction while preserving anchor kinds", async () => {
    const source = scene()
    const second = structuredClone(source.document.tracks[0]!.clips[0]!)
    second.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    second.anchor = { kind: "part", part_public_id: "part-7", edge: "end", offset_ms: 500 }
    second.duration_ms = 2_000
    source.document.tracks.push({ id: "music-2", kind: "music", name: "Music 2", volume: 1, muted: false, clips: [second] })
    source.resolved.tracks.push({
      ...source.document.tracks[1]!,
      clips: [{ ...second, resolved_start_ms: 10_500, resolved_duration_ms: 2_000 }],
    })
    const update = vi.fn().mockImplementation(async (document) => ({
      ...source, revision: 2, document,
    }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)
    const refs = [{ trackId: "music", clipId }, { trackId: "music-2", clipId: second.id }]

    session.beginGesture()
    expect(session.moveClips(refs, 48_000)).toBe(true)
    await session.commitGesture()

    expect(update).toHaveBeenCalledTimes(1)
    const document = update.mock.calls[0]![0]
    expect(document.tracks[0].clips[0].anchor).toEqual({ kind: "absolute", position_ms: 1_000 })
    expect(document.tracks[1].clips[0].anchor).toEqual({
      kind: "part", part_public_id: "part-7", edge: "end", offset_ms: 1_500,
    })
    session.dispose()
  })

  it("blocks the whole structural group move when one selected clip is locked", () => {
    const source = scene()
    const locked = structuredClone(source.document.tracks[0]!.clips[0]!)
    locked.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    locked.locked = true
    locked.anchor = { kind: "absolute", position_ms: 2_000 }
    locked.resolved_start_ms = 2_000
    locked.resolved_duration_ms = 2_000
    source.document.tracks[0]!.clips.push(locked)
    const session = new SoundSceneSession(source, {
      update: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    }, {
      replace: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })

    expect(session.moveClips([
      { trackId: "music", clipId }, { trackId: "music", clipId: locked.id },
    ], 48_000)).toBe(false)
    expect(session.editor.document().tracks[0]!.clips.map((clip) => clip.anchor)).toEqual([
      { kind: "absolute", position_ms: 0 },
      { kind: "absolute", position_ms: 2_000 },
    ])
    expect(session.snapshot().error).toMatch(/Unlock every selected clip/)
    session.dispose()
  })

  it("keeps obsolete Sequence overrides explicit until the operator removes them", async () => {
    const source = scene()
    source.document.sequence_overrides["00000000-0000-4000-8000-000000000099"] = {
      muted: true, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [],
    }
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    await session.removeSequenceOverride("00000000-0000-4000-8000-000000000099")

    expect(update.mock.calls[0]![0].sequence_overrides).toEqual({})
    session.dispose()
  })
})
