import { describe, expect, it, vi } from "vitest"

import type { SoundSceneClip } from "@/types/domain"
import {
  DECODED_PCM_BUDGET_BYTES, DecodedAudioCache, estimatedDecodedBytes,
  planClipSource,
} from "./sound-source-manager"

function clip(changes: Partial<SoundSceneClip> = {}): SoundSceneClip {
  return {
    id: "78af885c-aeb4-49bf-9edb-d3fc14496b2a", file_id: 1,
    duration_ms: 2_000, source_offset_ms: 0, gain: 1,
    fade_in_ms: 0, fade_out_ms: 0, loop: false, ducking: false,
    muted: false, locked: false, effects: [],
    anchor: { kind: "absolute", position_ms: 0 },
    filename: "source.wav", source_duration_ms: 2_000,
    resolved_start_ms: 0, resolved_duration_ms: 2_000,
    ...changes,
  }
}

describe("Sound Scene source planning", () => {
  it("streams long continuous media instead of decoding duration-proportional PCM", () => {
    const plan = planClipSource(clip({
      duration_ms: 60 * 60_000, resolved_duration_ms: 60 * 60_000,
      source_duration_ms: 60 * 60_000, loop: true,
    }), "/audio/long.mp3")

    expect(plan.mode).toBe("stream")
    expect(plan.decodedBytes).toBe(0)
  })

  it("buffers only a server segment for a precise short window in a long source", () => {
    const plan = planClipSource(clip({
      duration_ms: 1_400, resolved_duration_ms: 1_400,
      source_duration_ms: 40 * 60_000, source_offset_ms: 762_350,
    }), "/audio/long.mp3")

    expect(plan.mode).toBe("segment-buffer")
    expect(plan.url).toContain("offset_ms=762350")
    expect(plan.url).toContain("duration_ms=1400")
    expect(plan.bufferOffsetSeconds).toBe(0)
  })

  it("uses actual decoded bytes and evicts LRU entries within 96 MB", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }))
    const buffers = [
      { length: 6_000_000, numberOfChannels: 2 },
      { length: 6_000_000, numberOfChannels: 2 },
      { length: 6_000_000, numberOfChannels: 2 },
    ] as AudioBuffer[]
    const context = { decodeAudioData: vi.fn()
      .mockResolvedValueOnce(buffers[0])
      .mockResolvedValueOnce(buffers[1])
      .mockResolvedValueOnce(buffers[2]) } as unknown as AudioContext
    const cache = new DecodedAudioCache(context)

    await cache.get("/a")
    await cache.get("/b")
    await cache.get("/c")

    expect(cache.diagnostics().decodedBytes).toBeLessThanOrEqual(DECODED_PCM_BUDGET_BYTES)
    expect(cache.diagnostics().entries).toBe(2)
    cache.clear()
    expect(cache.diagnostics()).toEqual({ decodedBytes: 0, entries: 0 })
    vi.unstubAllGlobals()
  })

  it("calculates normalized stereo float PCM cost", () => {
    expect(estimatedDecodedBytes(1_000)).toBe(48_000 * 2 * 4)
  })
})
