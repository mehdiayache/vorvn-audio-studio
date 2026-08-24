import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const adapters: Array<{
    init: ReturnType<typeof vi.fn>
    setTracks: ReturnType<typeof vi.fn>
    setTrackVolume: ReturnType<typeof vi.fn>
    setTrackMute: ReturnType<typeof vi.fn>
    updateTrack: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    play: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    seek: ReturnType<typeof vi.fn>
    transport: {
      connectMasterOutput: ReturnType<typeof vi.fn>
      connectTrackOutput: ReturnType<typeof vi.fn>
      disconnectTrackOutput: ReturnType<typeof vi.fn>
    }
  }> = []
  const media: Array<{
    src: string; currentTime: number; duration: number; preload: string; readyState: number;
    paused: boolean;
    play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>;
    dispatch: (event: string) => void
  }> = []
  const gains: Array<{
    gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>;
      cancelScheduledValues: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn> }
    connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>
  }> = []
  const contexts: Array<{ currentTime: number }> = []
  const state = { deferSeek: false }
  class FakeAdapter {
    setTracks = vi.fn()
    setTrackVolume = vi.fn()
    setTrackMute = vi.fn()
    updateTrack = vi.fn()
    init = vi.fn().mockResolvedValue(undefined)
    play = vi.fn()
    pause = vi.fn()
    seek = vi.fn()
    isPlaying = vi.fn().mockReturnValue(false)
    getCurrentTime = vi.fn().mockReturnValue(0)
    dispose = vi.fn()
    masterOutputNode = { connect: vi.fn() }
    transport = {
      connectMasterOutput: vi.fn(), connectTrackOutput: vi.fn(),
      disconnectTrackOutput: vi.fn(),
    }
    constructor() { adapters.push(this) }
  }
  return { adapters, media, gains, contexts, state, FakeAdapter }
})

vi.mock("@dawcore/transport", () => ({ NativePlayoutAdapter: mocks.FakeAdapter }))

import { SoundScenePlayout } from "./sound-scene-playout"
import type { SoundScene } from "@/types/domain"

function scene(): SoundScene {
  const clips = ["a", "b"].map((id, index) => ({
    id: `78af885c-aeb4-49bf-9edb-d3fc14496b2${id}`,
    asset_id: index + 1, duration_ms: 2_000,
    source_offset_ms: 0, gain: index ? .5 : .25, fade_in_ms: 0,
    fade_out_ms: 0, loop: false, ducking: false,
    muted: false, locked: false, effects: [],
    anchor: { kind: "absolute" as const, position_ms: index * 2_000 },
    filename: `${id}.wav`, source_duration_ms: 2_000,
    resolved_start_ms: index * 2_000, resolved_duration_ms: 2_000,
  }))
  const track = { id: "music", kind: "audio" as const, name: "Music", volume: .8, muted: false, clips }
  return {
    production_id: 1, revision: 1, document: { version: 1, sequence_overrides: {}, tracks: [track] },
    can_undo: false, can_redo: false, updated_at: "now",
    resolved: { version: 1, signature: "two-clips", duration_ms: 6_000, sequence_projection: { signature: "sequence", duration_ms: 4_000, sample_rate: 48_000, spans: [] }, tracks: [track], orphans: [] },
    sequence_stem: { url: "", filename: "", duration_ms: 4_000, signature: "sequence", cached: true },
  }
}

describe("SoundScenePlayout", () => {
  beforeEach(() => {
    mocks.adapters.length = 0
    mocks.media.length = 0
    mocks.gains.length = 0
    mocks.contexts.length = 0
    mocks.state.deferSeek = false
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }))
    const parameter = () => ({
      value: 1, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    })
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
    vi.stubGlobal("Audio", class {
      listeners = new Map<string, Set<() => void>>()
      src = ""
      private time = 0
      get currentTime() { return this.time }
      set currentTime(value: number) {
        this.time = value
        if (!mocks.state.deferSeek) queueMicrotask(() => this.dispatch("seeked"))
      }
      duration = 3_600
      preload = ""
      readyState = 4
      paused = true
      play = vi.fn(async () => { this.dispatch("playing") })
      pause = vi.fn(() => { this.paused = true })
      load = vi.fn()
      removeAttribute = vi.fn()
      addEventListener = vi.fn((event: string, listener: () => void) => {
        const listeners = this.listeners.get(event) || new Set<() => void>()
        listeners.add(listener)
        this.listeners.set(event, listeners)
      })
      removeEventListener = vi.fn((event: string, listener: () => void) => {
        this.listeners.get(event)?.delete(listener)
      })
      dispatch = (event: string) => {
        if (event === "playing") this.paused = false
        for (const listener of this.listeners.get(event) || []) listener()
      }
      constructor() { mocks.media.push(this) }
    })
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    vi.stubGlobal("AudioContext", class {
      sampleRate = 48_000
      currentTime = 0
      destination = { connect: vi.fn() }
      decodeAudioData = vi.fn().mockResolvedValue({ duration: 2, sampleRate: 48_000, length: 96_000, numberOfChannels: 2 })
      createGain = vi.fn(() => {
        const gain = { ...node(), gain: parameter() }
        mocks.gains.push(gain)
        return gain
      })
      createDelay = vi.fn(() => ({ ...node(), delayTime: parameter() }))
      createBiquadFilter = vi.fn(() => ({ ...node(), type: "lowpass", frequency: parameter() }))
      createAnalyser = vi.fn(() => ({
        ...node(), fftSize: 1024, smoothingTimeConstant: 0,
        getFloatTimeDomainData: vi.fn(),
      }))
      createChannelSplitter = vi.fn(() => node())
      createMediaElementSource = vi.fn(() => node())
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
      constructor() { mocks.contexts.push(this) }
    })
  })

  it("uses one private playout track per clip so gains remain independent", async () => {
    const source = scene()
    const playout = new SoundScenePlayout(source)
    await playout.play(0)
    const adapter = mocks.adapters[0]!
    const master = mocks.gains[0]!
    expect(adapter.transport.connectMasterOutput).toHaveBeenCalledWith(master)
    const tracks = adapter.setTracks.mock.calls[0]![0]
    expect(tracks.map((track: { id: string }) => track.id)).toEqual([
      "music::clip::78af885c-aeb4-49bf-9edb-d3fc14496b2a",
      "music::clip::78af885c-aeb4-49bf-9edb-d3fc14496b2b",
    ])

    playout.setClipGain("music", source.document.tracks[0]!.clips[0]!.id, .4)

    expect(adapter.setTrackVolume).toHaveBeenCalledTimes(1)
    expect(adapter.setTrackVolume.mock.calls[0]![0]).toBe("music::clip::78af885c-aeb4-49bf-9edb-d3fc14496b2a")
    expect(adapter.setTrackVolume.mock.calls[0]![1]).toBeCloseTo(.32)
    playout.dispose()
    vi.unstubAllGlobals()
  })

  it("previews Music mute, fades and effects locally on the prepared clip", async () => {
    const source = scene()
    const clipId = source.document.tracks[0]!.clips[0]!.id
    const playout = new SoundScenePlayout(source)
    await playout.play(0)
    const adapter = mocks.adapters[0]!

    playout.setClipMix("music", clipId, {
      muted: true,
      fade_in_ms: 500,
      fade_out_ms: 750,
      effects: [
        { id: "telephone", type: "telephone", enabled: true },
        { id: "echo", type: "echo", enabled: true, delay_ms: 180, feedback: .2, mix: .4 },
      ],
    })

    expect(adapter.setTrackMute).toHaveBeenLastCalledWith(
      `music::clip::${clipId}`, true,
    )
    const updated = adapter.updateTrack.mock.calls.at(-1)?.[1]
    expect(updated.clips[0].fadeIn.duration).toBe(.5)
    expect(updated.clips.at(-1).fadeOut.duration).toBe(.75)
    expect(mocks.gains.some((node) => node.gain.value === .6)).toBe(true)
    expect(mocks.gains.some((node) => node.gain.value === .4)).toBe(true)

    playout.dispose()
    vi.unstubAllGlobals()
  })

  it("solos multiple Sound Design tracks locally without changing Sequence audibility", async () => {
    const source = scene()
    const ambience = structuredClone(source.document.tracks[0]!)
    ambience.id = "ambience"
    ambience.name = "Ambience"
    ambience.clips = ambience.clips.map((clip, index) => ({
      ...clip,
      id: `68af885c-aeb4-49bf-9edb-d3fc14496b2${index}`,
      asset_id: clip.asset_id + 20,
      filename: `ambience-${index}.wav`,
    }))
    source.document.tracks.push(ambience)
    source.resolved.tracks.push(structuredClone(ambience))
    source.resolved.signature = "two-audio-tracks"
    const playout = new SoundScenePlayout(source)
    playout.setSoloTracks(["music"])
    await playout.play(0)
    const adapter = mocks.adapters[0]!

    expect(adapter.setTracks.mock.calls[0]![0]
      .filter((track: { id: string }) => track.id.startsWith("ambience::"))
      .every((track: { muted: boolean }) => track.muted)).toBe(true)

    playout.setSoloTracks(["music"])
    expect(adapter.setTrackMute).toHaveBeenCalledWith(
      `ambience::clip::${ambience.clips[0]!.id}`, true,
    )
    expect(adapter.setTrackMute).toHaveBeenCalledWith(
      `music::clip::${source.document.tracks[0]!.clips[0]!.id}`, false,
    )

    adapter.setTrackMute.mockClear()
    playout.setSoloTracks(["music", "ambience"])
    expect(adapter.setTrackMute.mock.calls.every(([, muted]) => muted === false)).toBe(true)

    adapter.setTrackMute.mockClear()
    playout.muteTrack("ambience", true)
    playout.setSoloTracks(["music", "ambience"])
    expect(adapter.setTrackMute.mock.calls
      .filter(([id]) => String(id).startsWith("ambience::"))
      .every(([, muted]) => muted === true)).toBe(true)

    playout.dispose()
    vi.unstubAllGlobals()
  })

  it.each([10, 30, 60])("streams a %i-minute Sequence without decoded PCM growth and releases every heavy resource", async (minutes) => {
    const source = scene()
    source.sequence_stem.url = "/audio/sequence-stem.mp3"
    const durationMs = minutes * 60_000
    source.sequence_stem.duration_ms = durationMs
    source.resolved.duration_ms = durationMs
    source.resolved.sequence_projection.duration_ms = durationMs
    source.resolved.sequence_projection.spans = [{
      part_id: 1, part_public_id: "part-1", position: 0,
      kind: "speech", title: "Opening", role: "Narrator",
      voice_name: "Eva", filename: "part.mp3", start_ms: 0,
      duration_ms: durationMs, silence: false, missing: false,
      mix: { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] },
    }]
    source.document.tracks = []
    source.resolved.tracks = []
    const playout = new SoundScenePlayout(source)

    await playout.activatePlayout()

    expect(mocks.adapters[0]?.init).not.toHaveBeenCalled()

    expect(playout.diagnostics()).toEqual({
      active: true, decodedBytes: 0, bufferedSources: 0,
      streamedSources: 1, sequenceMode: "stream",
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.media[0]?.src).toBe("/audio/sequence-stem.mp3")

    playout.deactivatePlayout()

    expect(playout.diagnostics()).toEqual({
      active: false, decodedBytes: 0, bufferedSources: 0,
      streamedSources: 0, sequenceMode: "none",
    })
    expect(mocks.media[0]?.pause).toHaveBeenCalled()
    expect(mocks.media[0]?.removeAttribute).toHaveBeenCalledWith("src")
    expect(mocks.adapters[0]?.dispose).toHaveBeenCalled()
    playout.dispose()
    vi.unstubAllGlobals()
  })

  it("prepares every active long stream and keeps the common master silent until all starts resolve", async () => {
    const source = scene()
    const durationMs = 60 * 60_000
    source.sequence_stem = {
      url: "/audio/sequence-stem.mp3", filename: "sequence-stem.mp3",
      duration_ms: durationMs, signature: "sequence", cached: true,
    }
    source.resolved.duration_ms = durationMs
    source.resolved.sequence_projection.duration_ms = durationMs
    const original = source.document.tracks[0]!.clips[0]!
    const clips = ["a", "b"].map((suffix, index) => ({
      ...structuredClone(original),
      id: `78af885c-aeb4-49bf-9edb-d3fc14496b3${suffix}`,
      asset_id: index + 1, filename: `long-${suffix}.mp3`,
      duration_ms: durationMs, source_duration_ms: durationMs,
      resolved_start_ms: 0, resolved_duration_ms: durationMs,
      anchor: { kind: "absolute" as const, position_ms: 0 },
    }))
    source.document.tracks[0]!.clips = clips
    source.resolved.tracks[0]!.clips = clips
    source.resolved.signature = "three-active-streams"
    const playout = new SoundScenePlayout(source)
    await playout.activatePlayout()
    const starts: Array<() => void> = []
    for (const media of mocks.media)
      media.play.mockImplementation(() => new Promise<void>((resolve) => starts.push(resolve)))

    const playing = playout.play(0)
    await vi.waitFor(() => expect(starts).toHaveLength(3))
    expect(mocks.adapters[0]?.init).toHaveBeenCalledTimes(1)
    const master = mocks.gains[0]!
    expect(mocks.media.map((media) => media.preload)).toEqual(["auto", "auto", "auto"])
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)

    starts.forEach((resolve) => resolve())
    await Promise.resolve()
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0)
    mocks.media.forEach((media) => media.dispatch("playing"))
    await vi.waitFor(() => expect(starts).toHaveLength(6))
    starts.slice(3).forEach((resolve) => resolve())
    mocks.media.forEach((media) => media.dispatch("playing"))
    await playing

    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 0)
    mocks.contexts[0]!.currentTime = 12.5
    expect(playout.currentTime()).toBe(12.5)

    mocks.media.forEach((media) => media.play.mockImplementation(async () => media.dispatch("playing")))
    playout.seek(3_000)
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 12.5)
    await vi.waitFor(() => expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 12.5))
    expect(mocks.media.map((media) => media.currentTime)).toEqual([3_000, 3_000, 3_000])
    playout.dispose()
    vi.unstubAllGlobals()
  })

  it("starts Sequence automation at audible zero and gates buffered output through a delayed seek", async () => {
    const source = scene()
    const durationMs = 60 * 60_000
    source.sequence_stem = {
      url: "/audio/sequence-stem.mp3", filename: "sequence-stem.mp3",
      duration_ms: durationMs, signature: "sequence", cached: true,
    }
    source.resolved.duration_ms = durationMs
    source.resolved.sequence_projection.duration_ms = durationMs
    source.resolved.sequence_projection.spans = [
      {
        part_id: 1, part_public_id: "part-fade", position: 0, kind: "speech",
        title: "Fade", role: "Narrator", voice_name: "Eva", filename: "part.mp3",
        start_ms: 0, duration_ms: 3_000, silence: false, missing: false,
        mix: { muted: false, gain: 1, fade_in_ms: 2_000, fade_out_ms: 0, effects: [] },
      },
      {
        part_id: 2, part_public_id: "part-muted", position: 1, kind: "speech",
        title: "Muted", role: "Narrator", voice_name: "Eva", filename: "part.mp3",
        start_ms: 3_000, duration_ms: durationMs - 3_000, silence: false, missing: false,
        mix: { muted: true, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] },
      },
    ]
    const original = source.document.tracks[0]!.clips[0]!
    const clips = [
      {
        ...structuredClone(original), id: "78af885c-aeb4-49bf-9edb-d3fc14496b31",
        filename: "long.mp3", duration_ms: durationMs, source_duration_ms: durationMs,
        resolved_start_ms: 0, resolved_duration_ms: durationMs,
      },
      {
        ...structuredClone(original), id: "78af885c-aeb4-49bf-9edb-d3fc14496b32",
        filename: "cue.wav", duration_ms: 100, source_duration_ms: 100,
        resolved_start_ms: 3_000, resolved_duration_ms: 100,
        anchor: { kind: "absolute" as const, position_ms: 3_000 },
      },
    ]
    source.document.tracks[0]!.clips = clips
    source.resolved.tracks[0]!.clips = clips
    source.resolved.signature = "delayed-hybrid-boundary"
    const playout = new SoundScenePlayout(source)
    await playout.activatePlayout()
    const starts: Array<() => void> = []
    for (const media of mocks.media)
      media.play.mockImplementation(() => new Promise<void>((resolve) => starts.push(resolve)))

    const playing = playout.play(0)
    await vi.waitFor(() => expect(starts).toHaveLength(2))
    const adapter = mocks.adapters[0]!
    const master = mocks.gains[0]!
    mocks.contexts[0]!.currentTime = 5

    expect(mocks.gains.every((gain) => gain.gain.linearRampToValueAtTime.mock.calls.length === 0)).toBe(true)
    expect(adapter.play).not.toHaveBeenCalled()
    starts.forEach((resolve) => resolve())
    mocks.media.forEach((media) => media.dispatch("playing"))
    await vi.waitFor(() => expect(starts).toHaveLength(4))
    starts.slice(2).forEach((resolve) => resolve())
    mocks.media.forEach((media) => media.dispatch("playing"))
    await playing

    expect(mocks.gains.some((gain) => gain.gain.linearRampToValueAtTime.mock.calls
      .some((call) => call[0] === 1 && call[1] === 7))).toBe(true)
    expect(adapter.play).toHaveBeenCalledWith(0, 3_600)
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 5)

    mocks.media.forEach((media) => media.play.mockImplementation(async () => media.dispatch("playing")))
    mocks.state.deferSeek = true
    mocks.contexts[0]!.currentTime = 10
    const seekCalls = adapter.seek.mock.calls.length
    const automationGains = mocks.gains.slice(1)
    playout.seek(3)

    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10)
    expect(adapter.seek).toHaveBeenCalledTimes(seekCalls)
    expect(automationGains.every((gain) => !gain.gain.setValueAtTime.mock.calls
      .some((call) => call[0] === 0 && call[1] === 10))).toBe(true)

    await vi.waitFor(() => expect(mocks.media.map((media) => media.currentTime)).toEqual([3, 3]))
    mocks.media.forEach((media) => media.dispatch("seeked"))
    await vi.waitFor(() => expect(adapter.seek).toHaveBeenLastCalledWith(3))
    expect(automationGains.some((gain) => gain.gain.setValueAtTime.mock.calls
      .some((call) => call[0] === 0 && call[1] === 10))).toBe(true)
    expect(master.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 10)
    expect(adapter.seek.mock.invocationCallOrder.at(-1))
      .toBeLessThan(master.gain.setValueAtTime.mock.invocationCallOrder.at(-1)!)

    playout.dispose()
    vi.unstubAllGlobals()
  })

  it("uses conventional dry/wet Echo mix and leaves its tail bus open after a streamed clip ends", async () => {
    const source = scene()
    const clip = source.document.tracks[0]!.clips[0]!
    Object.assign(clip, {
      duration_ms: 60_000, source_duration_ms: 60_000,
      resolved_duration_ms: 60_000, effects: [{
        id: "2bc326ca-57ba-4e63-bdfd-6145dfb73181",
        type: "echo", enabled: true, delay_ms: 200, feedback: 0, mix: .25,
      }],
    })
    source.document.tracks[0]!.clips = [clip]
    source.resolved.tracks[0]!.clips = [clip]
    source.resolved.duration_ms = 60_200
    source.resolved.signature = "streamed-echo"
    const playout = new SoundScenePlayout(source)

    await playout.play(0)

    expect(mocks.gains.some((node) => node.gain.value === .75)).toBe(true)
    expect(mocks.gains.some((node) => node.gain.value === .25)).toBe(true)
    playout.seek(60.1)
    expect(playout.currentTime()).toBeCloseTo(60.1)
    expect(mocks.gains.some((node) => node.gain.value === .75)).toBe(true)
    expect(mocks.gains.some((node) => node.gain.value === .25)).toBe(true)

    playout.dispose()
    vi.unstubAllGlobals()
  })

  it("materializes only long stream clips near the playhead and releases distant handles on seek", async () => {
    const source = scene()
    source.sequence_stem.url = "/audio/sequence-stem.mp3"
    source.resolved.duration_ms = 60 * 60_000
    source.resolved.sequence_projection.duration_ms = 60 * 60_000
    source.resolved.sequence_projection.spans = []
    const original = source.document.tracks[0]!.clips[0]!
    const clips = [0, 20, 50].map((minute, index) => ({
      ...structuredClone(original),
      id: `78af885c-aeb4-49bf-9edb-d3fc14496b2${index}`,
      filename: `long-${index}.mp3`,
      duration_ms: 10 * 60_000, source_duration_ms: 10 * 60_000,
      resolved_start_ms: minute * 60_000,
      resolved_duration_ms: 10 * 60_000,
      anchor: { kind: "absolute" as const, position_ms: minute * 60_000 },
    }))
    source.document.tracks[0]!.clips = clips
    source.resolved.tracks[0]!.clips = clips
    source.resolved.signature = "lazy-stream-clips"
    const playout = new SoundScenePlayout(source)

    await playout.activatePlayout()
    expect(mocks.media.map((item) => item.src)).toEqual([
      "/audio/sequence-stem.mp3", "/audio/long-0.mp3",
    ])

    playout.seek(20 * 60)
    expect(mocks.media.map((item) => item.src)).toEqual([
      "/audio/sequence-stem.mp3", "/audio/long-0.mp3", "/audio/long-1.mp3",
    ])
    expect(mocks.media[1]?.removeAttribute).toHaveBeenCalledWith("src")
    expect(playout.diagnostics().streamedSources).toBe(2)

    playout.seek(50 * 60)
    expect(mocks.media[2]?.removeAttribute).toHaveBeenCalledWith("src")
    expect(mocks.media.at(-1)?.src).toBe("/audio/long-2.mp3")
    expect(playout.diagnostics().streamedSources).toBe(2)

    playout.dispose()
    vi.unstubAllGlobals()
  })
})
