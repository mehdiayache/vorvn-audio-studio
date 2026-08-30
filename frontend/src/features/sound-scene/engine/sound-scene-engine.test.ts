import { describe, expect, it, vi } from "vitest"

import type { SoundScene } from "@/types/domain"
import { SOUND_SCENE_ZOOM_LEVELS, SoundSceneEngine, soundSceneFitZoomIndex, soundSceneZoomIndex, soundSceneZoomLevel } from "./sound-scene-engine"
import { isLiveMixOnlyChange, soundTrackDisplayName, SoundSceneSession } from "./sound-scene-session"
import { loopBoundaryTimes, waveformPeakIndex } from "../timeline/waveform-projection"

const clipId = "78af885c-aeb4-49bf-9edb-d3fc14496b2c"

function scene(): SoundScene {
  const mix = { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] }
  const clip = { id: clipId, asset_id: 9, duration_ms: null, source_offset_ms: 0, gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, muted: false, locked: false, effects: [], anchor: { kind: "absolute" as const, position_ms: 0 }, asset_name: "Night bed", filename: "bed.mp3", source_duration_ms: 60_000, resolved_start_ms: 0, resolved_duration_ms: 10_000 }
  const track = { id: "music", kind: "audio" as const, name: "Music", volume: 1, muted: false, clips: [clip] }
  return { production_id: 6, revision: 1, document: { version: 1, sequence_overrides: {}, tracks: [track] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", duration_ms: 10_000, sequence_projection: { signature: "sequence", duration_ms: 10_000, sample_rate: 48_000, spans: [{ part_id: 7, part_public_id: "part-7", position: 0, kind: "speech", title: "Opening", role: "Narrator", voice_name: "Eva", filename: "opening.mp3", start_ms: 0, duration_ms: 10_000, silence: false, missing: false, mix }] }, tracks: [track], orphans: [] }, sequence_stem: { url: "/audio/stem.mp3", filename: "stem.mp3", duration_ms: 10_000, signature: "sequence", cached: true } }
}

describe("SoundSceneEngine", () => {
  it("preserves stable operator track names instead of deriving them from clips", () => {
    const track = scene().resolved.tracks[0]!
    expect(soundTrackDisplayName(track)).toBe("Music")
    expect(soundTrackDisplayName({ ...track, clips: [...track.clips, { ...track.clips[0]!, id: "second" }] })).toBe("Music")
    expect(soundTrackDisplayName({ ...track, name: "Operator mix", clips: [] })).toBe("Operator mix")
  })

  it("projects looped waveform peaks instead of stretching one source copy", () => {
    const projection = { clipDuration: 10, sourceDuration: 2, sourceOffset: 0, loop: true }
    expect([0, 20, 40, 60, 80].map((column) => waveformPeakIndex(column, 100, 20, projection)))
      .toEqual([0, 0, 0, 0, 0])
    expect([10, 30, 50, 70, 90].map((column) => waveformPeakIndex(column, 100, 20, projection)))
      .toEqual([10, 10, 10, 10, 10])
    expect(loopBoundaryTimes(projection)).toEqual([2, 4, 6, 8])

    const offsetProjection = { ...projection, clipDuration: 5, sourceOffset: 1 }
    expect(waveformPeakIndex(0, 100, 20, offsetProjection)).toBe(10)
    expect(loopBoundaryTimes(offsetProjection)).toEqual([1, 3])
  })

  it("distinguishes live mix commits from structural source and timing changes", () => {
    const previous = scene().document
    const mix = structuredClone(previous)
    mix.tracks[0]!.volume = .5
    mix.tracks[0]!.clips[0]!.gain = .4
    mix.tracks[0]!.clips[0]!.fade_in_ms = 800
    expect(isLiveMixOnlyChange(previous, mix)).toBe(true)

    const loop = structuredClone(mix)
    loop.tracks[0]!.clips[0]!.loop = false
    expect(isLiveMixOnlyChange(previous, loop)).toBe(false)
  })

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
  it("keeps multi-track Solo as local audition state and never persists it", () => {
    const source = scene()
    source.document.tracks.push({ id: "ambience", kind: "audio", name: "Ambience", volume: 1, muted: false, clips: [] })
    source.resolved.tracks.push(structuredClone(source.document.tracks[1]!))
    const update = vi.fn()
    const setSoloTracks = vi.fn()
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), setSoloTracks, dispose: vi.fn(),
    })

    session.toggleTrackSolo("music")
    session.toggleTrackSolo("ambience")
    expect(session.snapshot().soloTrackIds).toEqual(["music", "ambience"])
    expect(setSoloTracks).toHaveBeenLastCalledWith(["music", "ambience"])
    expect(update).not.toHaveBeenCalled()

    session.toggleTrackSolo("music")
    expect(session.snapshot().soloTrackIds).toEqual(["ambience"])
    session.clearTrackSolos()
    expect(session.snapshot().soloTrackIds).toEqual([])
    session.dispose()
  })

  it("adds another Music track without replacing the existing placement", async () => {
    const source = scene()
    const update = vi.fn().mockResolvedValue({ ...source, revision: 2 })
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    await session.addTrack({ id: 22, title: "Outro", category: "outro", duration_ms: 8_000 }, 3)

    const document = update.mock.calls[0]![0]
    expect(document.tracks).toHaveLength(2)
    expect(document.tracks[0].clips[0].asset_id).toBe(9)
    expect(document.tracks[1]).toMatchObject({ name: "Music 1", role: "music" })
    expect(document.tracks[1].clips[0].asset_id).toBe(22)
    expect(document.tracks[1].clips[0].anchor.position_ms).toBe(3_000)
    expect(document.tracks[1].clips[0]).toMatchObject({ gain: 1, duration_ms: 8_000, loop: false, ducking: false })
    session.dispose()
  })

  it("persists an explicit operator track name without changing its audio facts", async () => {
    const source = scene()
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })

    await session.renameTrack("music", "Prayer underscore")

    const document = update.mock.calls[0]![0]
    expect(document.tracks[0]).toMatchObject({ name: "Prayer underscore", volume: 1, muted: false })
    expect(document.tracks[0].clips[0].asset_id).toBe(9)
    session.dispose()
  })

  it("reclassifies a legacy generic track name but preserves a custom name", async () => {
    const source = scene()
    source.document.tracks[0]!.name = "Audio"
    source.document.tracks[0]!.role = "audio"
    source.resolved.tracks[0]!.name = "Audio"
    source.resolved.tracks[0]!.role = "audio"
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })

    await session.setTrackRole("music", "sfx")

    expect(update.mock.calls[0]![0].tracks[0]).toMatchObject({ name: "SFX 1", role: "sfx" })
    session.dispose()
  })

  it("keeps an operator track name stable when another clip is placed", async () => {
    const source = scene()
    source.document.tracks[0]!.name = "Night bed"
    source.resolved.tracks[0]!.name = "Night bed"
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })

    await session.addClip("music", { id: 24, title: "Bell", category: "sfx", duration_ms: 2_000 }, 4)

    const track = update.mock.calls[0]![0].tracks[0]
    expect(track.name).toBe("Night bed")
    expect(track.clips.map((clip: { asset_id: number }) => clip.asset_id)).toEqual([9, 24])
    session.dispose()
  })

  it("uses bed defaults only for Music and Ambience, not one-shot audio", async () => {
    const source = scene()
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    await session.addTrack({ id: 23, title: "Bed", category: "music", duration_ms: 15_000 }, 0)

    const music = update.mock.calls[0]![0].tracks[1].clips[0]
    expect(music).toMatchObject({ gain: .18, duration_ms: null, loop: true, ducking: true })
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
    expect(session.snapshot().playback).toBe("playing")
    resolveReplace()
    await replacement
    await Promise.resolve()
    expect(session.snapshot().playback).toBe("playing")
    expect(session.snapshot().playhead).toBe(2)
    session.dispose()
    vi.unstubAllGlobals()
  })

  it("never lets a late parent refresh replace a newer committed scene", async () => {
    const source = scene()
    const newer = structuredClone(source)
    newer.revision = 3
    newer.resolved.signature = "newer-local-scene"
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(newer, {
      update: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    }, playout)

    const lateParent = structuredClone(source)
    lateParent.revision = 2
    lateParent.resolved.signature = "late-parent-scene"
    session.reconcile(lateParent)

    expect(session.snapshot().scene.revision).toBe(3)
    expect(session.snapshot().scene.resolved.signature).toBe("newer-local-scene")
    expect(playout.replace).not.toHaveBeenCalled()
    session.dispose()
  })

  it("shows that playback is preparing and suppresses duplicate play requests", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(7))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const source = scene()
    let releasePlay!: () => void
    const pendingPlay = new Promise<void>((resolve) => { releasePlay = resolve })
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn().mockReturnValue(pendingPlay), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(true),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    }, playout)

    const playback = session.togglePlayback()
    expect(session.snapshot().playback).toBe("preparing")
    await session.togglePlayback()
    expect(playout.play).toHaveBeenCalledOnce()
    releasePlay()
    await playback
    expect(session.snapshot().playback).toBe("playing")
    session.dispose()
    vi.unstubAllGlobals()
  })

  it("keeps undo failures visible without leaving the session busy", async () => {
    const source = scene()
    const playout = {
      replace: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn(), muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update: vi.fn(), undo: vi.fn().mockRejectedValue(new Error("Undo is unavailable")), redo: vi.fn(),
    }, playout)

    await session.undo()
    expect(session.snapshot().saving).toBe(false)
    expect(session.snapshot().error).toBe("Undo is unavailable")
    session.dispose()
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

  it("previews Music mute, fades and effects without persisting pointer changes", async () => {
    const source = scene()
    const update = vi.fn().mockResolvedValue({ ...source, revision: 2 })
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), setClipMix: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update, undo: vi.fn(), redo: vi.fn(),
    }, playout)
    const effects = [{
      id: "echo", type: "echo" as const, enabled: true,
      delay_ms: 220, feedback: .3, mix: .25,
    }]

    session.updateClip("music", clipId, {
      muted: true, fade_in_ms: 800, fade_out_ms: 1_200, effects,
    })

    expect(playout.setClipMix).toHaveBeenCalledWith("music", clipId, {
      muted: true, fade_in_ms: 800, fade_out_ms: 1_200, effects,
    })
    expect(update).not.toHaveBeenCalled()
    await session.commitClip()
    expect(update).toHaveBeenCalledTimes(1)
    session.dispose()
  })

  it("serializes rapid commits against current revisions without losing the latest document", async () => {
    const source = scene()
    let resolveFirst!: (value: SoundScene) => void
    const firstResponse = new Promise<SoundScene>((resolve) => { resolveFirst = resolve })
    const update = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockImplementationOnce(async (document: SoundScene["document"], expectedRevision: number) => ({
        ...source, revision: expectedRevision + 1, document,
        resolved: { ...source.resolved, signature: "second-commit" },
      }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), setClipMix: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, {
      update, undo: vi.fn(), redo: vi.fn(),
    }, playout)

    const first = session.commitClipChanges("music", clipId, { gain: .4 })
    const second = session.commitClipChanges("music", clipId, { muted: true })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]![1]).toBe(1)

    const firstDocument = update.mock.calls[0]![0]
    resolveFirst({
      ...source, revision: 2, document: firstDocument,
      resolved: { ...source.resolved, signature: "first-commit" },
    })
    await first
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    await second

    const finalDocument = update.mock.calls[1]![0]
    expect(update.mock.calls[1]![1]).toBe(2)
    expect(finalDocument.tracks[0].clips[0]).toMatchObject({ gain: .4, muted: true })
    expect(session.snapshot().scene.revision).toBe(3)
    expect(session.snapshot().saving).toBe(false)
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

  it("persists track volume and mute as one coherent mix edit", async () => {
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

    await session.commitTrackMix("music", { volume: .65, muted: true })

    expect(playout.setTrackVolume).toHaveBeenCalledWith("music", .65)
    expect(playout.muteTrack).toHaveBeenCalledWith("music", true)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0]![0].tracks[0]).toMatchObject({ volume: .65, muted: true })
    session.dispose()
  })

  it("adopts a saved gain while playing without replacing or moving the transport", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(7))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const source = scene()
    const adopt = vi.fn()
    const replace = vi.fn().mockResolvedValue(undefined)
    const playout = {
      replace, adopt, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(3), isPlaying: vi.fn().mockReturnValue(true),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const update = vi.fn().mockImplementation(async (document) => ({
      ...source, revision: 2, document,
      resolved: { ...source.resolved, signature: "saved-gain" },
    }))
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    await session.togglePlayback()
    await session.commitClipChanges("music", clipId, { gain: .4 })

    expect(adopt).toHaveBeenCalledOnce()
    expect(replace).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).not.toHaveBeenCalled()
    expect(session.snapshot().playback).toBe("playing")
    session.dispose()
    vi.unstubAllGlobals()
  })

  it("applies a relative dB change without flattening a multi-clip selection", async () => {
    const source = scene()
    const second = structuredClone(source.document.tracks[0]!.clips[0]!)
    second.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    second.gain = .5
    source.document.tracks[0]!.clips.push(second)
    source.resolved.tracks[0]!.clips.push({ ...second, resolved_start_ms: 2_000, resolved_duration_ms: 10_000 })
    const update = vi.fn().mockImplementation(async (document: SoundScene["document"], expectedRevision: number) => ({
      ...source, revision: expectedRevision + 1, document,
    }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(),
      seek: vi.fn(), currentTime: vi.fn().mockReturnValue(0),
      isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)

    await session.commitSelectedClipGainDelta(6, [
      { trackId: "music", clipId },
      { trackId: "music", clipId: second.id },
    ])

    const [quiet, loud] = update.mock.calls[0]![0].tracks[0].clips
    expect(quiet.gain).toBeCloseTo(.2, 2)
    expect(loud.gain).toBeCloseTo(1, 2)
    expect(quiet.gain).not.toBe(loud.gain)
    expect(update).toHaveBeenCalledOnce()
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
    source.document.tracks.push({ id: "music-2", kind: "audio", name: "Music 2", volume: 1, muted: false, clips: [second] })
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

  it("splits selected clips at the playhead without duplicating their Asset", async () => {
    const source = scene()
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const playout = {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(4), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    }
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, playout)
    session.selectClip("music", clipId)

    expect(await session.splitClipsAtPlayhead(undefined, 4)).toBe(true)

    const [left, right] = update.mock.calls[0]![0].tracks[0].clips
    expect(update).toHaveBeenCalledOnce()
    expect(left).toMatchObject({ id: clipId, asset_id: 9, duration_ms: 4_000, source_offset_ms: 0, fade_in_ms: 2_000, fade_out_ms: 0 })
    expect(right).toMatchObject({ asset_id: 9, duration_ms: 6_000, source_offset_ms: 4_000, fade_in_ms: 0, fade_out_ms: 4_000, anchor: { kind: "absolute", position_ms: 4_000 } })
    expect(right.id).not.toBe(left.id)
    expect(session.snapshot().selection?.kind).toBe("clips")
    session.dispose()
  })

  it("nudges absolute and Part-anchored clips as one persisted group", async () => {
    const source = scene()
    const second = structuredClone(source.document.tracks[0]!.clips[0]!)
    second.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    second.anchor = { kind: "part", part_public_id: "part-7", edge: "end", offset_ms: 500 }
    source.document.tracks.push({ id: "audio-2", kind: "audio", name: "Audio 2", volume: 1, muted: false, clips: [second] })
    source.resolved.tracks.push({ ...source.document.tracks[1]!, clips: [{ ...second, resolved_start_ms: 10_500, resolved_duration_ms: 2_000 }] })
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })

    await session.nudgeClips(100, [{ trackId: "music", clipId }, { trackId: "audio-2", clipId: second.id }])

    const document = update.mock.calls[0]![0]
    expect(document.tracks[0].clips[0].anchor.position_ms).toBe(100)
    expect(document.tracks[1].clips[0].anchor.offset_ms).toBe(600)
    session.dispose()
  })

  it("creates a quick crossfade only from a real same-track overlap", async () => {
    const source = scene()
    source.resolved.tracks = structuredClone(source.resolved.tracks)
    const second = structuredClone(source.document.tracks[0]!.clips[0]!)
    second.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    second.duration_ms = 4_000
    second.anchor = { kind: "absolute", position_ms: 8_000 }
    second.resolved_start_ms = 8_000
    second.resolved_duration_ms = 4_000
    second.fade_in_ms = 0
    second.fade_out_ms = 0
    source.document.tracks[0]!.clips.push(second)
    source.resolved.tracks[0]!.clips.push({ ...second, resolved_start_ms: 8_000, resolved_duration_ms: 4_000 })
    const update = vi.fn().mockImplementation(async (document) => ({ ...source, revision: 2, document }))
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })
    const refs = [{ trackId: "music", clipId }, { trackId: "music", clipId: second.id }]

    expect(session.crossfadeOverlap(refs)?.overlapMs).toBe(2_000)
    expect(await session.crossfadeSelected(refs)).toBe(true)

    const [left, right] = update.mock.calls[0]![0].tracks[0].clips
    expect(left.fade_out_ms).toBe(2_000)
    expect(right.fade_in_ms).toBe(2_000)
    session.dispose()
  })

  it("plays and loops the exact selected clip range without persisting audition state", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(7))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const source = scene()
    const update = vi.fn()
    const play = vi.fn().mockResolvedValue(undefined)
    const seek = vi.fn()
    const session = new SoundSceneSession(source, { update, undo: vi.fn(), redo: vi.fn() }, {
      replace: vi.fn().mockResolvedValue(undefined), play, pause: vi.fn(), seek,
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(true), muteTrack: vi.fn(),
      setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })
    session.selectClip("music", clipId)

    expect(await session.playSelection(true)).toBe(true)
    expect(seek).toHaveBeenCalledWith(0)
    expect(play).toHaveBeenCalledWith(0)
    expect(session.snapshot().playbackRange).toEqual({ start: 0, end: 10, loop: true })
    expect(update).not.toHaveBeenCalled()
    session.dispose()
    vi.unstubAllGlobals()
  })

  it("moves a multi-track selection in one persisted transaction while preserving anchor kinds", async () => {
    const source = scene()
    const second = structuredClone(source.document.tracks[0]!.clips[0]!)
    second.id = "88af885c-aeb4-49bf-9edb-d3fc14496b2c"
    second.anchor = { kind: "part", part_public_id: "part-7", edge: "end", offset_ms: 500 }
    second.duration_ms = 2_000
    source.document.tracks.push({ id: "music-2", kind: "audio", name: "Music 2", volume: 1, muted: false, clips: [second] })
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

  it("persists embedded video-audio synchronization as derived state", async () => {
    const source = scene()
    let releaseUpdate!: (value: typeof source) => void
    const updateResult = new Promise<typeof source>((resolve) => { releaseUpdate = resolve })
    const update = vi.fn().mockReturnValue(updateResult)
    const session = new SoundSceneSession(source, {
      update, undo: vi.fn(), redo: vi.fn(),
    }, {
      replace: vi.fn().mockResolvedValue(undefined), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
      currentTime: vi.fn().mockReturnValue(0), isPlaying: vi.fn().mockReturnValue(false),
      muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    })
    const visualClipId = "30000000-0000-4000-8000-000000000001"

    const synchronization = session.syncVisualAudio({
      version: 1, canvas: { width: 1920, height: 1080 }, tracks: [{
        id: "video", name: "Video", media_type: "video",
        visible: true, locked: false, clips: [{
          id: visualClipId, asset_id: 77, start_ms: 2_000,
          duration_ms: 4_000, source_offset_ms: 500, fit: "cover",
          position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1,
          locked: false,
        }],
      }],
    }, [{
      id: 77, title: "Interview", media_type: "video",
      duration_ms: 10_000, sample_rate: 48_000, channels: 2,
    }])

    await Promise.resolve()
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0]![2]).toBe("derived_visual_audio")
    expect(session.snapshot().revisionKind).toBe("derived_visual_audio")
    const parentRefresh = {
      ...source, revision: 2, document: update.mock.calls[0]![0],
    }
    session.reconcile(parentRefresh)
    expect(session.snapshot().revisionKind).toBe("derived_visual_audio")
    expect(session.snapshot().scene.revision).toBe(source.revision)
    releaseUpdate(parentRefresh)
    await synchronization

    expect(session.snapshot().scene.revision).toBe(2)
    expect(session.editor.document()).toEqual(parentRefresh.document)
    const repeat = await session.syncVisualAudio({
      version: 1, canvas: { width: 1920, height: 1080 }, tracks: [{
        id: "video", name: "Video", media_type: "video",
        visible: true, locked: false, clips: [{
          id: visualClipId, asset_id: 77, start_ms: 2_000,
          duration_ms: 4_000, source_offset_ms: 500, fit: "cover",
          position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1,
          locked: false,
        }],
      }],
    }, [{
      id: 77, title: "Interview", media_type: "video",
      duration_ms: 10_000, sample_rate: 48_000, channels: 2,
    }])
    expect(repeat).toBe(false)
    expect(update).toHaveBeenCalledOnce()
    session.dispose()
  })
})
