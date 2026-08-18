import { NativePlayoutAdapter } from "@dawcore/transport"

import { audioUrl } from "@/lib/api"
import type { SoundScene, SoundSceneClip } from "@/types/domain"

const SAMPLE_RATE = 48_000
const MAX_BUFFER_CACHE = 12
const DUCKED_SUFFIX = "::ducked"
const DRY_SUFFIX = "::dry"
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

function repeatedClips(clip: SoundSceneClip, buffer: AudioBuffer, gainOverride?: number): PlayoutClip[] {
  const start = Number(clip.resolved_start_ms || 0) / 1000
  let remaining = Number(clip.resolved_duration_ms || 0) / 1000
  const initialOffset = Math.min(Number(clip.source_offset_ms || 0) / 1000, buffer.duration)
  const gain = gainOverride ?? Number(clip.gain ?? 1)
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
  private buffers = new Map<string, Promise<AudioBuffer>>()
  private duckNodes: AudioNode[] = []
  private sequenceAnalyser: AnalyserNode | null = null
  private duckGain: GainNode | null = null
  private duckFrame = 0
  private subgroupClipIds = new Map<string, string[]>()
  private liveClipGains = new Map<string, number>()

  constructor(private scene: SoundScene) {}

  async replace(scene: SoundScene) {
    if (scene.resolved.signature === this.scene.resolved.signature) {
      this.scene = scene
      return
    }
    const wasPrepared = Boolean(this.adapter && this.preparedSignature)
    const wasPlaying = this.isPlaying()
    const time = this.currentTime()
    this.scene = scene
    this.preparedSignature = ""
    if (!wasPrepared) return
    await this.prepare()
    this.seek(Math.min(time, this.duration()))
    if (wasPlaying) this.adapter?.play(this.currentTime(), this.duration())
  }

  private duration() {
    return this.scene.resolved.sequence_projection.duration_ms / 1000
  }

  private getBuffer(url: string) {
    const existing = this.buffers.get(url)
    if (existing) {
      this.buffers.delete(url)
      this.buffers.set(url, existing)
      return existing
    }
    const pending = decode(this.context!, url)
    this.buffers.set(url, pending)
    while (this.buffers.size > MAX_BUFFER_CACHE) {
      const oldest = this.buffers.keys().next().value as string | undefined
      if (!oldest) break
      this.buffers.delete(oldest)
    }
    pending.catch(() => this.buffers.delete(url))
    return pending
  }

  private clearDucking() {
    if (this.duckFrame) cancelAnimationFrame(this.duckFrame)
    this.duckFrame = 0
    for (const node of this.duckNodes) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
    this.duckNodes = []
    this.sequenceAnalyser = null
    this.duckGain = null
  }

  private installDucking(hasDuckedTracks: boolean) {
    this.clearDucking()
    if (!hasDuckedTracks || !this.adapter || !this.context) return
    const analyser = this.context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = .35
    this.adapter.transport.connectTrackOutput("sequence-stem", analyser)
    analyser.connect(this.adapter.masterOutputNode)

    const gain = this.context.createGain()
    gain.gain.value = 1
    for (const track of this.scene.resolved.tracks) {
      if (track.clips.some((clip) => clip.ducking)) {
        this.adapter.transport.connectTrackOutput(`${track.id}${DUCKED_SUFFIX}`, gain)
      }
    }
    gain.connect(this.adapter.masterOutputNode)
    this.sequenceAnalyser = analyser
    this.duckGain = gain
    this.duckNodes = [analyser, gain]

    const samples = new Float32Array(analyser.fftSize)
    const follow = () => {
      if (!this.sequenceAnalyser || !this.duckGain || !this.context) return
      this.sequenceAnalyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      const target = rms > .015 ? Math.max(.14, .015 / rms) : 1
      const timeConstant = target < this.duckGain.gain.value ? .02 : .45
      this.duckGain.gain.setTargetAtTime(target, this.context.currentTime, timeConstant)
      this.duckFrame = requestAnimationFrame(follow)
    }
    this.duckFrame = requestAnimationFrame(follow)
  }

  private async prepare() {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" })
      this.adapter = new NativePlayoutAdapter(this.context, { sampleRate: SAMPLE_RATE })
      await this.adapter.init()
    }
    if (this.preparedSignature === this.scene.resolved.signature) {
      await this.context.resume()
      return
    }
    const tracks: PlayoutTrack[] = []
    this.subgroupClipIds.clear()
    this.liveClipGains.clear()
    if (this.scene.sequence_stem.url) {
      const buffer = await this.getBuffer(this.scene.sequence_stem.url)
      tracks.push({
        id: "sequence-stem", name: "Sequence", muted: false, soloed: false,
        volume: 1, pan: 0, clips: [audioClip(
          "sequence-stem", buffer, 0, this.duration(), 0, 1, 0, 0,
        )],
      })
    }
    let hasDuckedTracks = false
    for (const track of this.scene.resolved.tracks) {
      const playable = track.clips.filter((clip) => clip.filename && !clip.orphan && !clip.missing && Number(clip.resolved_duration_ms || 0) > 0)
      for (const ducked of [false, true]) {
        const matching = playable.filter((clip) => Boolean(clip.ducking) === ducked)
        if (!matching.length) continue
        const subgroupId = `${track.id}${ducked ? DUCKED_SUFFIX : DRY_SUFFIX}`
        const singleClip = matching.length === 1 ? matching[0]! : null
        for (const clip of matching) this.liveClipGains.set(clip.id, Number(clip.gain ?? 1))
        this.subgroupClipIds.set(subgroupId, matching.map((clip) => clip.id))
        const clips = (await Promise.all(matching.map(async (clip) => repeatedClips(
          clip,
          await this.getBuffer(audioUrl(clip.filename!)),
          singleClip ? 1 : undefined,
        )))).flat()
        tracks.push({
          id: subgroupId,
          name: track.name,
          muted: track.muted,
          soloed: false,
          volume: track.volume * (singleClip ? Number(singleClip.gain ?? 1) : 1),
          pan: 0,
          clips,
        })
        hasDuckedTracks ||= ducked
      }
    }
    this.clearDucking()
    this.adapter!.setTracks(tracks)
    this.installDucking(hasDuckedTracks)
    this.preparedSignature = this.scene.resolved.signature
    await this.context.resume()
  }

  async play(from?: number) {
    await this.prepare()
    if (from !== undefined) this.adapter!.seek(from)
    this.adapter!.play(this.adapter!.getCurrentTime(), this.duration())
  }
  pause() { this.adapter?.pause() }
  seek(seconds: number) { this.adapter?.seek(seconds) }
  currentTime() { return this.adapter?.getCurrentTime() || 0 }
  isPlaying() { return this.adapter?.isPlaying() || false }
  muteTrack(trackId: string, muted: boolean) {
    this.adapter?.setTrackMute(`${trackId}${DUCKED_SUFFIX}`, muted)
    this.adapter?.setTrackMute(`${trackId}${DRY_SUFFIX}`, muted)
  }
  setTrackVolume(trackId: string, volume: number) {
    for (const suffix of [DUCKED_SUFFIX, DRY_SUFFIX]) {
      const subgroupId = `${trackId}${suffix}`
      const clipIds = this.subgroupClipIds.get(subgroupId) || []
      const clipGain = clipIds.length === 1 ? (this.liveClipGains.get(clipIds[0]!) ?? 1) : 1
      this.adapter?.setTrackVolume(subgroupId, volume * clipGain)
    }
  }
  setClipGain(trackId: string, clipId: string, gain: number) {
    const track = this.scene.resolved.tracks.find((item) => item.id === trackId)
    const clip = track?.clips.find((item) => item.id === clipId)
    if (!track || !clip) return
    this.liveClipGains.set(clipId, Math.max(0, gain))
    const original = Math.max(.0001, Number(clip.gain || 0))
    const suffix = clip.ducking ? DUCKED_SUFFIX : DRY_SUFFIX
    const subgroupId = `${trackId}${suffix}`
    const clipIds = this.subgroupClipIds.get(subgroupId) || []
    const liveTrackVolume = clipIds.length === 1
      ? track.volume * Math.max(0, gain)
      : Math.min(4, track.volume * Math.max(0, gain) / original)
    this.adapter?.setTrackVolume(subgroupId, liveTrackVolume)
  }
  dispose() {
    this.clearDucking()
    this.adapter?.dispose()
    void this.context?.close()
    this.adapter = null
    this.context = null
    this.buffers.clear()
    this.subgroupClipIds.clear()
    this.liveClipGains.clear()
  }
}
