import { NativePlayoutAdapter } from "@dawcore/transport"

import { audioUrl } from "@/lib/api"
import type { SoundScene, SoundSceneClip } from "@/types/domain"

const SAMPLE_RATE = 48_000
const MAX_BUFFER_CACHE = 12
const clipTrackId = (trackId: string, clipId: string) => `${trackId}::clip::${clipId}`
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
  private sceneVersion = 0
  private buffers = new Map<string, Promise<AudioBuffer>>()
  private duckNodes: AudioNode[] = []
  private sequenceAnalyser: AnalyserNode | null = null
  private duckGain: GainNode | null = null
  private duckFrame = 0
  private childTracks = new Map<string, string[]>()
  private internalTrackByClip = new Map<string, string>()
  private liveTrackVolumes = new Map<string, number>()
  private liveClipGains = new Map<string, number>()
  private preparedTrackIds = new Set<string>()

  constructor(private scene: SoundScene) {}

  async replace(scene: SoundScene) {
    if (scene.resolved.signature === this.scene.resolved.signature) {
      this.scene = scene
      return
    }
    const wasPrepared = Boolean(this.adapter && this.preparedSignature)
    const wasPlaying = this.isPlaying()
    const time = this.currentTime()
    this.sceneVersion += 1
    this.scene = scene
    this.preparedSignature = ""
    if (!wasPrepared) return
    await this.prepare()
    this.seek(Math.min(time, this.duration()))
    if (wasPlaying) this.adapter?.play(this.currentTime(), this.duration())
  }

  private duration(scene = this.scene) {
    return Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1000
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

  private installDucking(hasDuckedTracks: boolean, scene: SoundScene) {
    this.clearDucking()
    if (!hasDuckedTracks || !this.adapter || !this.context) return
    const analyser = this.context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = .35
    this.adapter.transport.connectTrackOutput("sequence-stem", analyser)
    analyser.connect(this.adapter.masterOutputNode)

    const gain = this.context.createGain()
    gain.gain.value = 1
    for (const track of scene.resolved.tracks) {
      if (track.clips.some((clip) => clip.ducking)) {
        for (const clip of track.clips.filter((item) => item.ducking)) {
          const internalId = this.internalTrackByClip.get(clip.id)
          if (internalId) this.adapter.transport.connectTrackOutput(internalId, gain)
        }
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

  private async prepare(): Promise<void> {
    const scene = this.scene
    const version = this.sceneVersion
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" })
      this.adapter = new NativePlayoutAdapter(this.context, { sampleRate: SAMPLE_RATE })
      await this.adapter.init()
    }
    if (this.preparedSignature === scene.resolved.signature) {
      await this.context.resume()
      return
    }
    const tracks: PlayoutTrack[] = []
    const childTracks = new Map<string, string[]>()
    const internalTrackByClip = new Map<string, string>()
    const liveTrackVolumes = new Map<string, number>()
    const liveClipGains = new Map<string, number>()
    if (scene.sequence_stem.url) {
      const buffer = await this.getBuffer(scene.sequence_stem.url)
      tracks.push({
        id: "sequence-stem", name: "Sequence", muted: false, soloed: false,
        volume: 1, pan: 0, clips: [audioClip(
          "sequence-stem", buffer, 0, this.duration(scene), 0, 1, 0, 0,
        )],
      })
    }
    let hasDuckedTracks = false
    for (const track of scene.resolved.tracks) {
      const playable = track.clips.filter((clip) => clip.filename && !clip.orphan && !clip.missing && Number(clip.resolved_duration_ms || 0) > 0)
      liveTrackVolumes.set(track.id, track.volume)
      const children: string[] = []
      for (const clip of playable) {
        const internalId = clipTrackId(track.id, clip.id)
        const gain = Number(clip.gain ?? 1)
        liveClipGains.set(clip.id, gain)
        internalTrackByClip.set(clip.id, internalId)
        children.push(internalId)
        const clips = repeatedClips(
          clip,
          await this.getBuffer(audioUrl(clip.filename!)),
          1,
        )
        tracks.push({
          id: internalId,
          name: track.name,
          muted: track.muted,
          soloed: false,
          volume: track.volume * gain,
          pan: 0,
          clips,
        })
        hasDuckedTracks ||= Boolean(clip.ducking)
      }
      childTracks.set(track.id, children)
    }
    if (version !== this.sceneVersion) return this.prepare()
    this.clearDucking()
    this.adapter!.setTracks(tracks)
    this.childTracks = childTracks
    this.internalTrackByClip = internalTrackByClip
    this.liveTrackVolumes = liveTrackVolumes
    this.liveClipGains = liveClipGains
    this.preparedTrackIds = new Set(tracks.map((track) => track.id))
    this.installDucking(hasDuckedTracks, scene)
    this.preparedSignature = scene.resolved.signature
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
    for (const internalId of this.childTracks.get(trackId) || [])
      this.adapter?.setTrackMute(internalId, muted)
  }
  setTrackVolume(trackId: string, volume: number) {
    this.liveTrackVolumes.set(trackId, volume)
    for (const clip of this.scene.resolved.tracks.find((item) => item.id === trackId)?.clips || []) {
      const internalId = this.internalTrackByClip.get(clip.id)
      if (internalId) this.adapter?.setTrackVolume(internalId, volume * (this.liveClipGains.get(clip.id) ?? 1))
    }
  }
  setClipGain(trackId: string, clipId: string, gain: number) {
    const track = this.scene.resolved.tracks.find((item) => item.id === trackId)
    const clip = track?.clips.find((item) => item.id === clipId)
    if (!track || !clip) return
    this.liveClipGains.set(clipId, Math.max(0, gain))
    const internalId = this.internalTrackByClip.get(clipId)
    if (internalId) this.adapter?.setTrackVolume(
      internalId,
      (this.liveTrackVolumes.get(trackId) ?? track.volume) * Math.max(0, gain),
    )
  }
  dispose() {
    this.clearDucking()
    this.adapter?.dispose()
    void this.context?.close()
    this.adapter = null
    this.context = null
    this.buffers.clear()
    this.childTracks.clear()
    this.internalTrackByClip.clear()
    this.liveTrackVolumes.clear()
    this.liveClipGains.clear()
    this.preparedTrackIds.clear()
  }
}
