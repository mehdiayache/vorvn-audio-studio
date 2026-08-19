import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const adapters: Array<{
    setTracks: ReturnType<typeof vi.fn>
    setTrackVolume: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }> = []
  const media: Array<{
    src: string; currentTime: number; duration: number; preload: string;
    play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>;
  }> = []
  const gains: Array<{
    gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>;
      cancelScheduledValues: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn> }
    connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>
  }> = []
  class FakeAdapter {
    setTracks = vi.fn()
    setTrackVolume = vi.fn()
    setTrackMute = vi.fn()
    init = vi.fn().mockResolvedValue(undefined)
    play = vi.fn()
    pause = vi.fn()
    seek = vi.fn()
    isPlaying = vi.fn().mockReturnValue(false)
    getCurrentTime = vi.fn().mockReturnValue(0)
    dispose = vi.fn()
    masterOutputNode = { connect: vi.fn() }
    transport = { connectTrackOutput: vi.fn() }
    constructor() { adapters.push(this) }
  }
  return { adapters, media, gains, FakeAdapter }
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
  const track = { id: "music", kind: "music" as const, name: "Music", volume: .8, muted: false, clips }
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }))
    const parameter = () => ({
      value: 1, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    })
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
    vi.stubGlobal("Audio", class {
      src = ""
      currentTime = 0
      duration = 3_600
      preload = ""
      play = vi.fn().mockResolvedValue(undefined)
      pause = vi.fn()
      load = vi.fn()
      removeAttribute = vi.fn()
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
      createMediaElementSource = vi.fn(() => node())
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
    })
  })

  it("uses one private playout track per clip so gains remain independent", async () => {
    const source = scene()
    const playout = new SoundScenePlayout(source)
    await playout.play(0)
    const adapter = mocks.adapters[0]!
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
