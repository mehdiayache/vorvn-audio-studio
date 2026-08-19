import type { SoundSceneClip } from "@/types/domain"

export const DECODED_PCM_BUDGET_BYTES = 96 * 1024 * 1024
const SINGLE_BUFFER_TARGET_BYTES = 24 * 1024 * 1024
const PRECISE_WINDOW_MS = 30_000
const SAMPLE_RATE = 48_000
const CHANNELS = 2
const BYTES_PER_SAMPLE = 4

export type AudioSourceMode = "buffer" | "segment-buffer" | "stream"
export type AudioSourcePlan = {
  mode: AudioSourceMode
  url: string
  decodedBytes: number
  bufferOffsetSeconds: number
}

export function estimatedDecodedBytes(durationMs: number) {
  return Math.max(0, Math.ceil(durationMs / 1_000 * SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE))
}

function segmentUrl(filename: string, offsetMs: number, durationMs: number) {
  const query = new URLSearchParams({
    offset_ms: String(Math.max(0, Math.round(offsetMs))),
    duration_ms: String(Math.max(100, Math.min(120_000, Math.round(durationMs)))),
  })
  return `/api/v1/media/segments/${encodeURIComponent(filename)}?${query}`
}

export function planClipSource(
  clip: SoundSceneClip,
  sourceUrl: string,
  reservedDecodedBytes = 0,
): AudioSourcePlan {
  const sourceDurationMs = Math.max(
    100,
    Number(clip.source_duration_ms || clip.resolved_duration_ms || clip.duration_ms || 100),
  )
  const usedDurationMs = Math.max(
    100,
    Number(clip.resolved_duration_ms || clip.duration_ms || sourceDurationMs),
  )
  const wholeSourceBytes = estimatedDecodedBytes(sourceDurationMs)
  const shortPreciseWindow = usedDurationMs <= PRECISE_WINDOW_MS && !clip.loop

  if (wholeSourceBytes <= SINGLE_BUFFER_TARGET_BYTES
      && reservedDecodedBytes + wholeSourceBytes <= DECODED_PCM_BUDGET_BYTES) {
    return {
      mode: "buffer", url: sourceUrl, decodedBytes: wholeSourceBytes,
      bufferOffsetSeconds: Number(clip.source_offset_ms || 0) / 1_000,
    }
  }
  if (shortPreciseWindow) {
    const windowBytes = estimatedDecodedBytes(usedDurationMs)
    if (reservedDecodedBytes + windowBytes <= DECODED_PCM_BUDGET_BYTES) {
      return {
        mode: "segment-buffer",
        url: segmentUrl(
          clip.filename || "", Number(clip.source_offset_ms || 0), usedDurationMs),
        decodedBytes: windowBytes,
        bufferOffsetSeconds: 0,
      }
    }
  }
  return { mode: "stream", url: sourceUrl, decodedBytes: 0, bufferOffsetSeconds: 0 }
}

type BufferEntry = { promise: Promise<AudioBuffer>; bytes: number }

export class DecodedAudioCache {
  private entries = new Map<string, BufferEntry>()
  private bytes = 0

  constructor(
    private context: AudioContext,
    readonly budgetBytes = DECODED_PCM_BUDGET_BYTES,
  ) {}

  async get(url: string) {
    const existing = this.entries.get(url)
    if (existing) {
      this.entries.delete(url)
      this.entries.set(url, existing)
      return existing.promise
    }
    const entry: BufferEntry = {
      bytes: 0,
      promise: fetch(url).then((response) => {
        if (!response.ok) throw new Error(`Audio source unavailable (${response.status})`)
        return response.arrayBuffer()
      }).then((encoded) => this.context.decodeAudioData(encoded)).then((buffer) => {
        entry.bytes = buffer.length * buffer.numberOfChannels * 4
        this.bytes += entry.bytes
        this.evict(url)
        if (entry.bytes > this.budgetBytes) {
          this.remove(url)
          throw new Error("That audio source is too large for precise buffered playback.")
        }
        return buffer
      }),
    }
    this.entries.set(url, entry)
    entry.promise.catch(() => this.remove(url))
    return entry.promise
  }

  private evict(protectedUrl: string) {
    while (this.bytes > this.budgetBytes) {
      const oldest = [...this.entries.keys()].find((url) => url !== protectedUrl)
      if (!oldest) break
      this.remove(oldest)
    }
  }

  private remove(url: string) {
    const entry = this.entries.get(url)
    if (!entry) return
    this.bytes = Math.max(0, this.bytes - entry.bytes)
    this.entries.delete(url)
  }

  clear() {
    this.entries.clear()
    this.bytes = 0
  }

  diagnostics() { return { decodedBytes: this.bytes, entries: this.entries.size } }
}
