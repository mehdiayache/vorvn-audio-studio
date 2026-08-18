import { NativePlayoutAdapter } from "@dawcore/transport"

import { audioUrl } from "@/lib/api"
import type { SoundScene, SoundSceneClip, SoundSceneTrack } from "@/types/domain"

const SAMPLE_RATE = 48_000
const toSamples = (seconds: number) => Math.max(0, Math.round(seconds * SAMPLE_RATE))

type PlayoutClip = {
  id: string
  audioBuffer: AudioBuffer
  startSample: number
  durationSamples: number
  offsetSamples: number
  sampleRate: number
  sourceDurationSamples: number
  gain: number
  fadeIn?: { duration: number; type: "linear" }
  fadeOut?: { duration: number; type: "linear" }
}

type PlayoutTrack = {
  id: string
  name: string
  muted: boolean
  soloed: boolean
  volume: number
  pan: number
  clips: PlayoutClip[]
}

async function decode(context: AudioContext, url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Audio source unavailable (${response.status})`)
  return context.decodeAudioData(await response.arrayBuffer())
}

function audioClip(id: string, buffer: AudioBuffer, start: number, duration: number, offset: number, gain: number, fadeIn: number, fadeOut: number): PlayoutClip {
  return {
    id,
    audioBuffer: buffer,
    startSample: toSamples(start),
    durationSamples: Math.max(1, Math.round(duration * buffer.sampleRate)),
    offsetSamples: Math.max(0, Math.round(offset * buffer.sampleRate)),
    sampleRate: buffer.sampleRate,
    sourceDurationSamples: buffer.length,
    gain,
    fadeIn: fadeIn ? { duration: fadeIn, type: "linear" } : undefined,
    fadeOut: fadeOut ? { duration: fadeOut, type: "linear" } : undefined,
  }
}

function repeatedClips(clip: SoundSceneClip, buffer: AudioBuffer): PlayoutClip[] {
  const start = Number(clip.resolved_start_ms || 0) / 1000
  let remaining = Number(clip.resolved_duration_ms || 0) / 1000
  const initialOffset = Math.min(Number(clip.source_offset_ms || 0) / 1000, buffer.duration)
  const gain = Number(clip.gain ?? 1)
  const fadeIn = Number(clip.fade_in_ms || 0) / 1000
  const fadeOut = Number(clip.fade_out_ms || 0) / 1000
  const result: PlayoutClip[] = []
  let cursor = start
  let offset = initialOffset
  let index = 0
  while (remaining > .001) {
    const available = Math.max(0, buffer.duration - offset)
    if (available <= .001) break
    const duration = Math.min(available, remaining)
    const last = remaining - duration <= .001
    result.push(audioClip(
      `${clip.id}:${index}`,
      buffer,
      cursor,
      duration,
      offset,
      gain,
      index === 0 ? Math.min(fadeIn, duration) : 0,
      last ? Math.min(fadeOut, duration) : 0,
    ))
    remaining -= duration
    cursor += duration
    index += 1
    if (!clip.loop) break
    offset = 0
  }
  return result
}

export class SoundScenePlayout {
  private context: AudioContext | null = null
  private adapter: NativePlayoutAdapter | null = null
  private preparedSignature = ""

  constructor(private scene: SoundScene) {}

  replace(scene: SoundScene) {
    if (scene.resolved.signature === this.scene.resolved.signature) return
    this.pause()
    this.scene = scene
    this.preparedSignature = ""
  }

  private async prepare() {
    if (this.adapter && this.preparedSignature === this.scene.resolved.signature) {
      await this.context?.resume()
      return
    }
    this.adapter?.dispose()
    await this.context?.close()
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" })
    this.adapter = new NativePlayoutAdapter(this.context, { sampleRate: SAMPLE_RATE })
    const cache = new Map<string, Promise<AudioBuffer>>()
    const getBuffer = (url: string) => {
      const pending = cache.get(url) || decode(this.context!, url)
      cache.set(url, pending)
      return pending
    }
    const tracks: PlayoutTrack[] = []
    if (this.scene.voice_stem.url) {
      const buffer = await getBuffer(this.scene.voice_stem.url)
      tracks.push({
        id: "voice-stem", name: "Voice", muted: false, soloed: false,
        volume: 1, pan: 0, clips: [audioClip(
          "voice-stem", buffer, 0,
          this.scene.resolved.voice_projection.duration_ms / 1000,
          0, 1, 0, 0,
        )],
      })
    }
    for (const track of this.scene.resolved.tracks) {
      const playable = track.clips.filter((clip) => clip.filename && !clip.orphan && !clip.missing && Number(clip.resolved_duration_ms || 0) > 0)
      const clips = (await Promise.all(playable.map(async (clip) => repeatedClips(clip, await getBuffer(audioUrl(clip.filename!)))))).flat()
      tracks.push({
        id: track.id, name: track.name, muted: track.muted,
        soloed: false, volume: 1, pan: 0, clips,
      })
    }
    await this.adapter.init()
    this.adapter.setTracks(tracks)
    this.preparedSignature = this.scene.resolved.signature
    await this.context.resume()
  }

  async play(from?: number) {
    await this.prepare()
    if (from !== undefined) this.adapter!.seek(from)
    this.adapter!.play(
      this.adapter!.getCurrentTime(),
      this.scene.resolved.voice_projection.duration_ms / 1000,
    )
  }
  pause() { this.adapter?.pause() }
  seek(seconds: number) { this.adapter?.seek(seconds) }
  currentTime() { return this.adapter?.getCurrentTime() || 0 }
  isPlaying() { return this.adapter?.isPlaying() || false }
  muteTrack(trackId: string, muted: boolean) { this.adapter?.setTrackMute(trackId, muted) }
  dispose() {
    this.adapter?.dispose()
    void this.context?.close()
    this.adapter = null
    this.context = null
  }
}

export type { SoundSceneTrack }
