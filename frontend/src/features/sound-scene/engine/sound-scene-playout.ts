import { NativePlayoutAdapter } from "@dawcore/transport"

import { audioUrl } from "@/lib/api"
import type { SequenceMixOverride, SoundScene, SoundSceneClip, SoundSceneEffect } from "@/types/domain"
import { DecodedAudioCache, planClipSource } from "./sound-source-manager"

const SAMPLE_RATE = 48_000
const STREAM_PREROLL_SECONDS = 30
const STREAM_RELEASE_BEHIND_SECONDS = 5
const STREAM_READY_TIMEOUT_MS = 8_000
const STREAM_SYNC_TOLERANCE_SECONDS = .05
const HAVE_METADATA = 1
const HAVE_FUTURE_DATA = 3
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

type StreamHandle = {
  element: HTMLAudioElement
  nodes: AudioNode[]
  gain: GainNode
  trackId?: string
  clip?: SoundSceneClip
  trackVolume: number
  muted: boolean
}

type StreamDescriptor = {
  trackId: string
  trackVolume: number
  trackMuted: boolean
  clip: SoundSceneClip
}

type EchoBus = { key: string; send: GainNode }

type EffectRoute = {
  input: AudioNode
  destination: AudioNode
  nodes: AudioNode[]
  bufferedTrackId?: string
}

type SequenceStream = StreamHandle & {
  rawGain: GainNode
  telephoneGain: GainNode
  detectorGain: GainNode
  echoBuses: EchoBus[]
  analyser: AnalyserNode
}

export type SoundSceneMeter = {
  left: number
  right: number
  peak: number
  clipping: boolean
}

function audioClip(
  id: string, buffer: AudioBuffer, start: number, duration: number,
  offset: number, fadeIn: number, fadeOut: number,
): PlayoutClip {
  return {
    id, audioBuffer: buffer, startSample: toSamples(start),
    durationSamples: Math.max(1, Math.round(duration * buffer.sampleRate)),
    offsetSamples: Math.max(0, Math.round(offset * buffer.sampleRate)),
    sampleRate: buffer.sampleRate, sourceDurationSamples: buffer.length, gain: 1,
    fadeIn: fadeIn ? { duration: fadeIn, type: "linear" } : undefined,
    fadeOut: fadeOut ? { duration: fadeOut, type: "linear" } : undefined,
  }
}

function repeatedClips(
  clip: SoundSceneClip, buffer: AudioBuffer, offsetOverride?: number,
): PlayoutClip[] {
  const start = Number(clip.resolved_start_ms || 0) / 1_000
  let remaining = Number(clip.resolved_duration_ms || 0) / 1_000
  const requestedOffset = offsetOverride ?? Number(clip.source_offset_ms || 0) / 1_000
  const initialOffset = Math.min(requestedOffset, buffer.duration)
  const fadeIn = Number(clip.fade_in_ms || 0) / 1_000
  const fadeOut = Number(clip.fade_out_ms || 0) / 1_000
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
      `${clip.id}:${index}`, buffer, cursor, duration, offset,
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

function effectIndex(effects: SoundSceneEffect[], type: SoundSceneEffect["type"]) {
  return effects.findIndex((effect) => effect.enabled && effect.type === type)
}

function echoKey(effect: Extract<SoundSceneEffect, { type: "echo" }>, telephoneBefore: boolean, telephoneAfter: boolean) {
  return [effect.delay_ms, effect.feedback, effect.mix, telephoneBefore ? 1 : 0, telephoneAfter ? 1 : 0].join(":")
}

function valueAt(mix: SequenceMixOverride, local: number, duration: number, base: number) {
  if (mix.muted || base <= 0) return 0
  const fadeIn = Math.min(duration, mix.fade_in_ms / 1_000)
  const fadeOut = Math.min(duration, mix.fade_out_ms / 1_000)
  if (fadeIn && local < fadeIn) return base * Math.max(0, local / fadeIn)
  if (fadeOut && local > duration - fadeOut)
    return base * Math.max(0, (duration - local) / fadeOut)
  return base
}

export class SoundScenePlayout {
  private context: AudioContext | null = null
  private adapter: NativePlayoutAdapter | null = null
  private adapterInitialization: Promise<void> | null = null
  private cache: DecodedAudioCache | null = null
  private audibleMaster: GainNode | null = null
  private meterLeft: AnalyserNode | null = null
  private meterRight: AnalyserNode | null = null
  private meterNodes: AudioNode[] = []
  private meterValue: SoundSceneMeter = { left: 0, right: 0, peak: 0, clipping: false }
  private meterListeners = new Set<() => void>()
  private clipUntil = 0
  private preparedSignature = ""
  private sceneVersion = 0
  private active = false
  private playing = false
  private playhead = 0
  private startedAt = 0
  private synchronizing = false
  private streamFrame = 0
  private seekGeneration = 0
  private sequenceStream: SequenceStream | null = null
  private streams: StreamHandle[] = []
  private streamDescriptors = new Map<string, StreamDescriptor>()
  private audioStreams = new Map<string, StreamHandle>()
  private effectRoutes = new Map<string, EffectRoute>()
  private childTracks = new Map<string, string[]>()
  private internalTrackByClip = new Map<string, string>()
  private clipByInternalTrack = new Map<string, string>()
  private bufferedTrackByClip = new Map<string, PlayoutTrack>()
  private liveTrackVolumes = new Map<string, number>()
  private liveTrackMutes = new Map<string, boolean>()
  private soloTrackIds = new Set<string>()
  private liveClipGains = new Map<string, number>()
  private liveClips = new Map<string, SoundSceneClip>()
  private preparedTrackIds = new Set<string>()
  private duckedBufferedTracks = new Set<string>()
  private sequenceMixPreviews = new Map<string, Partial<SequenceMixOverride>>()
  private detectorCompressionGain = 1
  private visibilityListener = () => {
    if (document.hidden) this.deactivatePlayout()
  }

  constructor(private scene: SoundScene) {
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibilityListener)
  }

  private duration(scene = this.scene) {
    return Number(scene.resolved.duration_ms ?? scene.resolved.sequence_projection.duration_ms) / 1_000
  }

  private async ensureActive() {
    if (this.context && this.adapter && this.cache && this.audibleMaster) return true
    const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" })
    const adapter = new NativePlayoutAdapter(context, { sampleRate: SAMPLE_RATE })
    if (!this.active) {
      adapter.dispose()
      void context.close()
      return false
    }
    this.context = context
    this.adapter = adapter
    this.cache = new DecodedAudioCache(context)
    this.audibleMaster = context.createGain()
    this.audibleMaster.gain.value = 0
    this.audibleMaster.connect(context.destination)
    const splitter = context.createChannelSplitter(2)
    const meterLeft = context.createAnalyser()
    const meterRight = context.createAnalyser()
    const silentSink = context.createGain()
    silentSink.gain.value = 0
    for (const analyser of [meterLeft, meterRight]) {
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = .32
      analyser.connect(silentSink)
    }
    this.audibleMaster.connect(splitter)
    splitter.connect(meterLeft, 0)
    splitter.connect(meterRight, 1)
    silentSink.connect(context.destination)
    this.meterLeft = meterLeft
    this.meterRight = meterRight
    this.meterNodes = [splitter, meterLeft, meterRight, silentSink]
    adapter.transport.connectMasterOutput(this.audibleMaster)
    return true
  }

  private async initializeAdapter() {
    const adapter = this.adapter
    if (!adapter) return false
    if (!this.adapterInitialization)
      this.adapterInitialization = adapter.init()
    await this.adapterInitialization
    return this.active && this.adapter === adapter
  }

  async activatePlayout() {
    this.active = true
    await this.prepare()
    await this.prepareStreams(this.playhead)
  }

  deactivatePlayout() {
    this.pause()
    this.seekGeneration += 1
    this.sceneVersion += 1
    if (this.streamFrame) cancelAnimationFrame(this.streamFrame)
    this.streamFrame = 0
    for (const stream of this.streams) this.releaseStream(stream)
    this.streams = []
    this.streamDescriptors.clear()
    this.audioStreams.clear()
    this.sequenceStream = null
    this.clearEffectRoutes()
    this.adapter?.dispose()
    void this.context?.close()
    this.cache?.clear()
    this.adapter = null
    this.adapterInitialization = null
    this.context = null
    this.cache = null
    this.audibleMaster = null
    for (const node of this.meterNodes) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
    this.meterNodes = []
    this.meterLeft = null
    this.meterRight = null
    this.publishMeter({ left: 0, right: 0, peak: 0, clipping: false })
    this.preparedSignature = ""
    this.childTracks.clear()
    this.internalTrackByClip.clear()
    this.clipByInternalTrack.clear()
    this.bufferedTrackByClip.clear()
    this.liveTrackVolumes.clear()
    this.liveTrackMutes.clear()
    this.liveClipGains.clear()
    this.liveClips.clear()
    this.preparedTrackIds.clear()
    this.duckedBufferedTracks.clear()
    this.detectorCompressionGain = 1
    this.active = false
  }

  async replace(scene: SoundScene) {
    this.sequenceMixPreviews.clear()
    if (scene.resolved.signature === this.scene.resolved.signature) {
      this.scene = scene
      return
    }
    const wasActive = this.active
    const wasPlaying = this.isPlaying()
    const time = this.currentTime()
    this.scene = scene
    this.playhead = Math.min(time, this.duration())
    this.deactivatePlayout()
    if (!wasActive) return
    await this.activatePlayout()
    this.seek(this.playhead)
    if (wasPlaying) await this.play(this.playhead)
  }

  private mediaElement(url: string) {
    const element = new Audio()
    element.preload = "metadata"
    element.src = url
    return element
  }

  private telephone(input: AudioNode, nodes: AudioNode[]) {
    const high = this.context!.createBiquadFilter()
    high.type = "highpass"
    high.frequency.value = 300
    const low = this.context!.createBiquadFilter()
    low.type = "lowpass"
    low.frequency.value = 3_400
    input.connect(high)
    high.connect(low)
    nodes.push(high, low)
    return low
  }

  private fixedEffects(input: AudioNode, effects: SoundSceneEffect[], nodes: AudioNode[]) {
    let current = input
    for (const effect of effects) {
      if (!effect.enabled) continue
      if (effect.type === "telephone") {
        current = this.telephone(current, nodes)
        continue
      }
      const sum = this.context!.createGain()
      const dry = this.context!.createGain()
      const delay = this.context!.createDelay(1)
      const feedback = this.context!.createGain()
      const wet = this.context!.createGain()
      delay.delayTime.value = effect.delay_ms / 1_000
      feedback.gain.value = effect.feedback
      dry.gain.value = 1 - effect.mix
      wet.gain.value = effect.mix
      current.connect(dry)
      dry.connect(sum)
      current.connect(delay)
      delay.connect(feedback)
      feedback.connect(delay)
      delay.connect(wet)
      wet.connect(sum)
      nodes.push(sum, dry, delay, feedback, wet)
      current = sum
    }
    return current
  }

  private rebuildEffectRoute(
    clipId: string, input: AudioNode, destination: AudioNode,
    effects: SoundSceneEffect[], bufferedTrackId?: string,
  ) {
    const existing = this.effectRoutes.get(clipId)
    try { input.disconnect() } catch { /* no previous route */ }
    for (const node of existing?.nodes || []) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
    const nodes: AudioNode[] = []
    this.fixedEffects(input, effects, nodes).connect(destination)
    this.effectRoutes.set(clipId, {
      input, destination, nodes,
      bufferedTrackId: bufferedTrackId ?? existing?.bufferedTrackId,
    })
  }

  private removeEffectRoute(clipId: string) {
    const route = this.effectRoutes.get(clipId)
    if (!route) return
    if (route.bufferedTrackId)
      this.adapter?.transport.disconnectTrackOutput(route.bufferedTrackId)
    try { route.input.disconnect() } catch { /* already disconnected */ }
    for (const node of route.nodes) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
    this.effectRoutes.delete(clipId)
  }

  private clearEffectRoutes() {
    for (const clipId of [...this.effectRoutes.keys()]) this.removeEffectRoute(clipId)
  }

  private createSequenceStream(url: string, scene: SoundScene) {
    const element = this.mediaElement(url)
    const source = this.context!.createMediaElementSource(element)
    const nodes: AudioNode[] = [source]
    const rawGain = this.context!.createGain()
    const telephoneSource = this.telephone(source, nodes)
    const telephoneGain = this.context!.createGain()
    rawGain.gain.value = 0
    telephoneGain.gain.value = 0
    source.connect(rawGain)
    rawGain.connect(this.audibleMaster!)
    telephoneSource.connect(telephoneGain)
    telephoneGain.connect(this.audibleMaster!)
    nodes.push(rawGain, telephoneGain)

    const echoBuses: EchoBus[] = []
    const keys = new Set<string>()
    for (const span of scene.resolved.sequence_projection.spans) {
      const effects = span.mix.effects.filter((effect) => effect.enabled)
      const telephone = effectIndex(effects, "telephone")
      effects.forEach((candidate, index) => {
        if (candidate.type !== "echo") return
        const before = telephone >= 0 && telephone < index
        const after = telephone > index
        const key = echoKey(candidate, before, after)
        if (keys.has(key)) return
        keys.add(key)
        const send = this.context!.createGain()
        const delay = this.context!.createDelay(1)
        const feedback = this.context!.createGain()
        send.gain.value = 0
        delay.delayTime.value = candidate.delay_ms / 1_000
        feedback.gain.value = candidate.feedback
        ;(before ? telephoneSource : source).connect(send)
        send.connect(delay)
        delay.connect(feedback)
        feedback.connect(delay)
        const output = after ? this.telephone(delay, nodes) : delay
        output.connect(this.audibleMaster!)
        nodes.push(send, delay, feedback)
        echoBuses.push({ key, send })
      })
    }
    const analyser = this.context!.createAnalyser()
    const detectorGain = this.context!.createGain()
    const silentTap = this.context!.createGain()
    silentTap.gain.value = 0
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = .35
    source.connect(detectorGain)
    detectorGain.connect(analyser)
    analyser.connect(silentTap)
    silentTap.connect(this.audibleMaster!)
    nodes.push(detectorGain, analyser, silentTap)
    const handle: SequenceStream = {
      element, nodes, gain: rawGain, trackVolume: 1, muted: false,
      rawGain, telephoneGain, detectorGain, echoBuses, analyser,
    }
    this.streams.push(handle)
    this.sequenceStream = handle
  }

  private scheduleParameter(
    parameter: AudioParam, from: number,
    level: (mix: SequenceMixOverride) => number,
  ) {
    const now = this.context!.currentTime
    parameter.cancelScheduledValues(now)
    parameter.setValueAtTime(0, now)
    for (const span of this.scene.resolved.sequence_projection.spans) {
      const start = span.start_ms / 1_000
      const duration = span.duration_ms / 1_000
      const end = start + duration
      if (end <= from) continue
      const begin = Math.max(start, from)
      const local = begin - start
      const mix = {
        ...span.mix,
        ...this.sequenceMixPreviews.get(span.part_public_id),
      }
      const base = level(mix)
      const at = now + begin - from
      parameter.setValueAtTime(valueAt(mix, local, duration, base), at)
      const fadeIn = Math.min(duration, mix.fade_in_ms / 1_000)
      const fadeOut = Math.min(duration, mix.fade_out_ms / 1_000)
      if (fadeIn && begin < start + fadeIn)
        parameter.linearRampToValueAtTime(base, now + start + fadeIn - from)
      if (fadeOut && end - fadeOut > begin)
        parameter.setValueAtTime(base, now + end - fadeOut - from)
      parameter.linearRampToValueAtTime(fadeOut ? 0 : base, now + end - from)
      parameter.setValueAtTime(0, now + end - from)
    }
  }

  private scheduleSequenceMix(from: number) {
    const stream = this.sequenceStream
    if (!stream || !this.context) return
    const dryLevel = (mix: SequenceMixOverride, telephone: boolean) => {
      const effects = mix.effects.filter((effect) => effect.enabled)
      if ((effectIndex(effects, "telephone") >= 0) !== telephone) return 0
      const echo = effects.find((effect) => effect.type === "echo")
      return mix.gain * (echo?.type === "echo" ? 1 - echo.mix : 1)
    }
    this.scheduleParameter(stream.rawGain.gain, from, (mix) => dryLevel(mix, false))
    this.scheduleParameter(stream.telephoneGain.gain, from, (mix) => dryLevel(mix, true))
    this.scheduleParameter(stream.detectorGain.gain, from, (mix) => mix.gain)
    for (const bus of stream.echoBuses) {
      this.scheduleParameter(bus.send.gain, from, (mix) => {
        const effects = mix.effects.filter((effect) => effect.enabled)
        const telephone = effectIndex(effects, "telephone")
        const match = effects.find((candidate, index) => candidate.type === "echo"
          && echoKey(candidate, telephone >= 0 && telephone < index, telephone > index) === bus.key)
        return match?.type === "echo" ? mix.gain * match.mix : 0
      })
    }
  }

  private createAudioStream(descriptor: StreamDescriptor) {
    const { trackId, trackVolume, trackMuted, clip } = descriptor
    const element = this.mediaElement(audioUrl(clip.filename!))
    const source = this.context!.createMediaElementSource(element)
    const nodes: AudioNode[] = [source]
    const gain = this.context!.createGain()
    gain.gain.value = 0
    source.connect(gain)
    this.rebuildEffectRoute(clip.id, gain, this.audibleMaster!, clip.effects)
    nodes.push(gain)
    const handle = {
      element, nodes, gain, trackId, clip, trackVolume,
      muted: trackMuted || clip.muted,
    }
    this.streams.push(handle)
    this.audioStreams.set(clip.id, handle)
  }

  private materializeRelevantStreams(time: number) {
    for (const descriptor of this.streamDescriptors.values()) {
      const clip = descriptor.clip
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const end = start + Number(clip.resolved_duration_ms || 0) / 1_000
        + Number(clip.effect_tail_ms || 0) / 1_000
      const relevant = start <= time + STREAM_PREROLL_SECONDS
        && end >= time - STREAM_RELEASE_BEHIND_SECONDS
      const existing = this.audioStreams.get(clip.id)
      if (relevant && !existing) this.createAudioStream(descriptor)
      if (!relevant && existing) {
        this.releaseStream(existing)
        this.audioStreams.delete(clip.id)
        this.streams = this.streams.filter((stream) => stream !== existing)
      }
    }
  }

  private installBufferedEffectRoute(trackId: string, clip: SoundSceneClip) {
    if (!this.adapter) return
    const input = this.context!.createGain()
    this.adapter.transport.connectTrackOutput(trackId, input)
    this.rebuildEffectRoute(
      clip.id, input, this.adapter.masterOutputNode, clip.effects, trackId,
    )
  }

  private async prepare(): Promise<void> {
    const scene = this.scene
    const version = this.sceneVersion
    if (!await this.ensureActive()) return
    if (this.preparedSignature === scene.resolved.signature) return
    for (const stream of this.streams) this.releaseStream(stream)
    this.clearEffectRoutes()
    this.streams = []
    this.sequenceStream = null
    this.streamDescriptors.clear()
    this.audioStreams.clear()
    const tracks: PlayoutTrack[] = []
    const childTracks = new Map<string, string[]>()
    const internalTrackByClip = new Map<string, string>()
    const clipByInternalTrack = new Map<string, string>()
    const bufferedTrackByClip = new Map<string, PlayoutTrack>()
    const liveTrackVolumes = new Map<string, number>()
    const liveTrackMutes = new Map<string, boolean>()
    const liveClipGains = new Map<string, number>()
    const liveClips = new Map<string, SoundSceneClip>()
    const bufferedEffects: Array<{ id: string; clip: SoundSceneClip }> = []
    let reservedDecodedBytes = 0
    if (scene.sequence_stem.url)
      this.createSequenceStream(scene.sequence_stem.url, scene)

    for (const track of scene.resolved.tracks) {
      const playable = track.clips.filter((clip) => clip.filename && !clip.orphan
        && !clip.missing && Number(clip.resolved_duration_ms || 0) > 0)
      liveTrackVolumes.set(track.id, track.volume)
      liveTrackMutes.set(track.id, track.muted)
      const children: string[] = []
      for (const clip of playable) {
        const internalId = clipTrackId(track.id, clip.id)
        const gain = Number(clip.gain ?? 1)
        liveClipGains.set(clip.id, gain)
        liveClips.set(clip.id, { ...clip, effects: structuredClone(clip.effects) })
        const plan = planClipSource(clip, audioUrl(clip.filename!), reservedDecodedBytes)
        if (plan.mode === "stream") {
          this.streamDescriptors.set(clip.id, {
            trackId: track.id, trackVolume: track.volume,
            trackMuted: track.muted, clip,
          })
          continue
        }
        reservedDecodedBytes += plan.decodedBytes
        internalTrackByClip.set(clip.id, internalId)
        clipByInternalTrack.set(internalId, clip.id)
        children.push(internalId)
        const buffer = await this.cache!.get(plan.url)
        const playoutTrack = {
          id: internalId, name: track.name,
          muted: track.muted || clip.muted
            || Boolean(this.soloTrackIds.size && !this.soloTrackIds.has(track.id)),
          soloed: false,
          volume: track.volume * gain, pan: 0,
          clips: repeatedClips(clip, buffer, plan.bufferOffsetSeconds),
        }
        tracks.push(playoutTrack)
        bufferedTrackByClip.set(clip.id, playoutTrack)
        bufferedEffects.push({ id: internalId, clip })
        if (clip.ducking) this.duckedBufferedTracks.add(internalId)
      }
      childTracks.set(track.id, children)
    }
    if (version !== this.sceneVersion) return
    this.adapter!.setTracks(tracks)
    for (const item of bufferedEffects) this.installBufferedEffectRoute(item.id, item.clip)
    this.childTracks = childTracks
    this.internalTrackByClip = internalTrackByClip
    this.clipByInternalTrack = clipByInternalTrack
    this.bufferedTrackByClip = bufferedTrackByClip
    this.liveTrackVolumes = liveTrackVolumes
    this.liveTrackMutes = liveTrackMutes
    this.liveClipGains = liveClipGains
    this.liveClips = liveClips
    this.preparedTrackIds = new Set(tracks.map((track) => track.id))
    this.preparedSignature = scene.resolved.signature
    this.materializeRelevantStreams(this.playhead)
  }

  private releaseStream(stream: StreamHandle) {
    if (stream.clip) this.removeEffectRoute(stream.clip.id)
    stream.element.pause()
    stream.element.removeAttribute("src")
    stream.element.load()
    for (const node of stream.nodes) {
      try { node.disconnect() } catch { /* already disconnected */ }
    }
  }

  private sourceTime(clip: SoundSceneClip, elapsed: number) {
    const offset = Number(clip.source_offset_ms || 0) / 1_000
    const sourceDuration = Math.max(.1, Number(clip.source_duration_ms || 100) / 1_000)
    const firstWindow = Math.max(0, sourceDuration - offset)
    if (!clip.loop || elapsed <= firstWindow) return Math.min(sourceDuration, offset + elapsed)
    return (elapsed - firstWindow) % sourceDuration
  }

  private fadeGain(clip: SoundSceneClip, elapsed: number, duration: number) {
    const fadeIn = Math.min(duration, clip.fade_in_ms / 1_000)
    const fadeOut = Math.min(duration, clip.fade_out_ms / 1_000)
    if (fadeIn && elapsed < fadeIn) return elapsed / fadeIn
    if (fadeOut && elapsed > duration - fadeOut)
      return Math.max(0, (duration - elapsed) / fadeOut)
    return 1
  }

  private waitForMedia(
    element: HTMLAudioElement, event: "loadedmetadata" | "canplay",
    ready: () => boolean,
  ) {
    if (ready() || typeof element.addEventListener !== "function")
      return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => {
        globalThis.clearTimeout(timeout)
        element.removeEventListener(event, finish)
        resolve()
      }
      const timeout = globalThis.setTimeout(finish, STREAM_READY_TIMEOUT_MS)
      element.addEventListener(event, finish, { once: true })
    })
  }

  private async prepareStreams(time: number) {
    this.materializeRelevantStreams(time)
    const targets: Array<{ element: HTMLAudioElement; sourceTime: number }> = []
    if (this.sequenceStream) {
      targets.push({
        element: this.sequenceStream.element,
        sourceTime: Math.min(
          time,
          Number.isFinite(this.sequenceStream.element.duration)
            ? this.sequenceStream.element.duration : time,
        ),
      })
    }
    for (const stream of this.streams) {
      const clip = stream.clip
      if (!clip) continue
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const duration = Number(clip.resolved_duration_ms || 0) / 1_000
      const elapsed = time - start
      if (elapsed < 0 || elapsed >= duration) continue
      targets.push({ element: stream.element, sourceTime: this.sourceTime(clip, elapsed) })
    }
    await Promise.all(targets.map(async ({ element, sourceTime }) => {
      element.preload = "auto"
      if (Number(element.readyState) < HAVE_METADATA) {
        element.load()
        await this.waitForMedia(
          element, "loadedmetadata",
          () => Number(element.readyState) >= HAVE_METADATA,
        )
      }
      await this.seekStream(element, sourceTime)
      await this.waitForMedia(
        element, "canplay",
        () => Number(element.readyState) >= HAVE_FUTURE_DATA,
      )
    }))
  }

  private activeStreamElements(time: number) {
    const elements: HTMLAudioElement[] = []
    if (this.sequenceStream) elements.push(this.sequenceStream.element)
    for (const stream of this.streams) {
      const clip = stream.clip
      if (!clip) continue
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const duration = Number(clip.resolved_duration_ms || 0) / 1_000
      if (time >= start && time < start + duration) elements.push(stream.element)
    }
    return elements
  }

  private waitForPlaybackStart(element: HTMLAudioElement) {
    if (!element.paused || typeof element.addEventListener !== "function")
      return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => {
        globalThis.clearTimeout(timeout)
        element.removeEventListener("playing", finish)
        resolve()
      }
      const timeout = globalThis.setTimeout(finish, STREAM_READY_TIMEOUT_MS)
      element.addEventListener("playing", finish, { once: true })
    })
  }

  private seekStream(element: HTMLAudioElement, time: number) {
    if (Math.abs(element.currentTime - time) <= .01) return Promise.resolve()
    if (typeof element.addEventListener !== "function") {
      element.currentTime = time
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const finish = () => {
        globalThis.clearTimeout(timeout)
        element.removeEventListener("seeked", finish)
        resolve()
      }
      const timeout = globalThis.setTimeout(finish, STREAM_READY_TIMEOUT_MS)
      element.addEventListener("seeked", finish, { once: true })
      element.currentTime = time
    })
  }

  private async alignStreams(time: number) {
    const seeks: Promise<void>[] = []
    if (this.sequenceStream) seeks.push(this.seekStream(
      this.sequenceStream.element,
      Math.min(time, Number.isFinite(this.sequenceStream.element.duration)
        ? this.sequenceStream.element.duration : time),
    ))
    for (const stream of this.streams) {
      const clip = stream.clip
      if (!clip) continue
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const duration = Number(clip.resolved_duration_ms || 0) / 1_000
      const elapsed = time - start
      if (elapsed >= 0 && elapsed < duration)
        seeks.push(this.seekStream(stream.element, this.sourceTime(clip, elapsed)))
    }
    await Promise.all(seeks)
  }

  private async primeAlignedStreams(time: number) {
    const elements = this.activeStreamElements(time)
    const firstStarts = elements.map((element) => this.waitForPlaybackStart(element))
    await Promise.all(this.syncStreams(time, true))
    await Promise.all(firstStarts)

    // A seeked MediaElement can report ready while its decoded output is still
    // refilling. Warm the path first, then perform the final seek while paused
    // and wait for both the real play promises and playing events before the
    // shared master is opened.
    for (const element of elements) element.pause()
    await this.alignStreams(time)
    const finalStarts = elements.map((element) => this.waitForPlaybackStart(element))
    await Promise.all(elements.map((element) => element.play().catch(() => undefined)))
    await Promise.all(finalStarts)
  }

  private closeAudibleMaster() {
    if (!this.context || !this.audibleMaster) return
    const now = this.context.currentTime
    this.audibleMaster.gain.cancelScheduledValues(now)
    this.audibleMaster.gain.setValueAtTime(0, now)
  }

  private openAudibleMaster() {
    if (!this.context || !this.audibleMaster) return
    const now = this.context.currentTime
    this.audibleMaster.gain.cancelScheduledValues(now)
    this.audibleMaster.gain.setValueAtTime(1, now)
  }

  private syncStreams(time: number, shouldPlay: boolean) {
    this.materializeRelevantStreams(time)
    const starts: Promise<void>[] = []
    const sequence = this.sequenceStream
    if (sequence) {
      if (Math.abs(sequence.element.currentTime - time) > STREAM_SYNC_TOLERANCE_SECONDS)
        sequence.element.currentTime = Math.min(
          time, Number.isFinite(sequence.element.duration) ? sequence.element.duration : time)
      if (shouldPlay) starts.push(sequence.element.play().catch(() => undefined))
      else sequence.element.pause()
    }
    for (const stream of this.streams) {
      const clip = stream.clip
      if (!clip) continue
      const live = this.liveClips.get(clip.id) || clip
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const duration = Number(clip.resolved_duration_ms || 0) / 1_000
      const elapsed = time - start
      const active = shouldPlay && elapsed >= 0 && elapsed < duration
      const trackMuted = this.liveTrackMutes.get(stream.trackId || "") ?? stream.muted
      const soloSuppressed = Boolean(stream.trackId && this.soloTrackIds.size
        && !this.soloTrackIds.has(stream.trackId))
      const gain = trackMuted || live.muted || soloSuppressed ? 0 : stream.trackVolume
        * (this.liveClipGains.get(clip.id) ?? live.gain)
        * this.fadeGain(live, Math.max(0, elapsed), duration)
        * this.duckGain(live)
      stream.gain.gain.value = active ? gain : 0
      if (!active) { stream.element.pause(); continue }
      const sourceTime = this.sourceTime(clip, elapsed)
      if (Math.abs(stream.element.currentTime - sourceTime) > STREAM_SYNC_TOLERANCE_SECONDS)
        stream.element.currentTime = sourceTime
      starts.push(stream.element.play().catch(() => undefined))
    }
    return starts
  }

  private updateDucking() {
    if (!this.sequenceStream) { this.detectorCompressionGain = 1; return }
    const samples = new Float32Array(this.sequenceStream.analyser.fftSize)
    this.sequenceStream.analyser.getFloatTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce(
      (sum, value) => sum + value * value, 0) / samples.length)
    this.detectorCompressionGain = rms > .015 ? Math.min(1, .015 / rms) : 1
    for (const internalId of this.duckedBufferedTracks) {
      const clipId = this.clipByInternalTrack.get(internalId)
      if (!clipId) continue
      const track = this.scene.resolved.tracks.find((candidate) =>
        candidate.clips.some((clip) => clip.id === clipId))
      const clip = this.liveClips.get(clipId)
      const trackMuted = this.liveTrackMutes.get(track?.id || "") ?? track?.muted ?? false
      const soloSuppressed = Boolean(track?.id && this.soloTrackIds.size
        && !this.soloTrackIds.has(track.id))
      this.adapter?.setTrackMute(internalId, trackMuted || soloSuppressed || Boolean(clip?.muted))
      this.adapter?.setTrackVolume(
        internalId,
        (this.liveTrackVolumes.get(track?.id || "") ?? track?.volume ?? 1)
        * (this.liveClipGains.get(clipId) ?? 1) * this.duckGain(clip),
      )
    }
  }

  private duckGain(clip?: SoundSceneClip) {
    if (!clip?.ducking) return 1
    const amountDb = Math.max(-30, Math.min(0, Number(clip.duck_amount_db ?? -12)))
    const floor = 10 ** (amountDb / 20)
    return floor + (1 - floor) * this.detectorCompressionGain
  }

  private analyserLevel(analyser: AnalyserNode | null) {
    if (!analyser) return { rms: 0, peak: 0 }
    const samples = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    let peak = 0
    for (const sample of samples) {
      sum += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }
    return { rms: Math.sqrt(sum / Math.max(1, samples.length)), peak }
  }

  private updateMeter() {
    const left = this.analyserLevel(this.meterLeft)
    const right = this.analyserLevel(this.meterRight)
    const peak = Math.max(left.peak, right.peak)
    if (peak >= .995) this.clipUntil = performance.now() + 1_500
    this.publishMeter({
      left: Math.min(1, left.rms * 3.2),
      right: Math.min(1, right.rms * 3.2),
      peak: Math.min(1, peak),
      clipping: performance.now() < this.clipUntil,
    })
  }

  private publishMeter(value: SoundSceneMeter) {
    const current = this.meterValue
    if (Math.abs(current.left - value.left) < .006
      && Math.abs(current.right - value.right) < .006
      && Math.abs(current.peak - value.peak) < .006
      && current.clipping === value.clipping) return
    this.meterValue = value
    this.meterListeners.forEach((listener) => listener())
  }

  subscribeMeter = (listener: () => void) => {
    this.meterListeners.add(listener)
    return () => this.meterListeners.delete(listener)
  }
  meterSnapshot = () => this.meterValue

  private followStreams() {
    if (this.streamFrame) cancelAnimationFrame(this.streamFrame)
    const update = () => {
      if (!this.playing) { this.streamFrame = 0; return }
      const time = this.currentTime()
      if (time >= this.duration()) { this.pause(); return }
      this.updateDucking()
      this.syncStreams(time, true)
      this.updateMeter()
      this.streamFrame = requestAnimationFrame(update)
    }
    this.streamFrame = requestAnimationFrame(update)
  }

  async play(from?: number) {
    await this.activatePlayout()
    if (!await this.initializeAdapter()) return
    if (from !== undefined) {
      this.playhead = Math.max(0, Math.min(this.duration(), from))
      this.adapter!.seek(this.playhead)
      this.syncStreams(this.playhead, false)
    }
    await this.context!.resume()
    this.closeAudibleMaster()
    await this.prepareStreams(this.playhead)
    this.playing = true
    this.synchronizing = true
    await this.primeAlignedStreams(this.playhead)
    if (!this.playing || !this.active) return
    this.scheduleSequenceMix(this.playhead)
    this.startedAt = this.context!.currentTime
    if (this.preparedTrackIds.size)
      this.adapter!.play(this.playhead, this.duration())
    this.synchronizing = false
    this.openAudibleMaster()
    this.followStreams()
  }

  private async resynchronizeAfterSeek(time: number, generation: number) {
    await this.prepareStreams(time)
    if (!this.playing || !this.active || generation !== this.seekGeneration) return
    await this.primeAlignedStreams(time)
    if (!this.playing || !this.active || generation !== this.seekGeneration) return
    this.adapter?.seek(time)
    this.scheduleSequenceMix(time)
    this.playhead = time
    this.startedAt = this.context!.currentTime
    this.synchronizing = false
    this.openAudibleMaster()
  }

  pause() {
    this.seekGeneration += 1
    if (this.playing) this.playhead = this.currentTime()
    this.playing = false
    this.synchronizing = false
    this.adapter?.pause()
    this.closeAudibleMaster()
    this.syncStreams(this.playhead, false)
    if (this.streamFrame) cancelAnimationFrame(this.streamFrame)
    this.streamFrame = 0
  }

  seek(seconds: number) {
    this.playhead = Math.max(0, Math.min(this.duration(), seconds))
    if (this.playing && this.context && this.audibleMaster) {
      const generation = ++this.seekGeneration
      this.synchronizing = true
      this.closeAudibleMaster()
      void this.resynchronizeAfterSeek(this.playhead, generation)
    } else {
      this.adapter?.seek(this.playhead)
      this.syncStreams(this.playhead, false)
    }
  }

  currentTime() {
    if (!this.playing || !this.context || this.synchronizing) return this.playhead
    return Math.min(this.duration(), this.playhead + this.context.currentTime - this.startedAt)
  }
  isPlaying() { return this.playing }

  muteTrack(trackId: string, muted: boolean) {
    this.liveTrackMutes.set(trackId, muted)
    for (const internalId of this.childTracks.get(trackId) || []) {
      const clipId = this.clipByInternalTrack.get(internalId)
      const clipMuted = Boolean(clipId && this.liveClips.get(clipId)?.muted)
      this.adapter?.setTrackMute(internalId, muted || clipMuted
        || Boolean(this.soloTrackIds.size && !this.soloTrackIds.has(trackId)))
    }
    for (const descriptor of this.streamDescriptors.values())
      if (descriptor.trackId === trackId) descriptor.trackMuted = muted
  }

  setSoloTracks(trackIds: Iterable<string>) {
    this.soloTrackIds = new Set(trackIds)
    for (const [trackId, internalIds] of this.childTracks) {
      const trackMuted = (this.liveTrackMutes.get(trackId) ?? false)
        || Boolean(this.soloTrackIds.size && !this.soloTrackIds.has(trackId))
      for (const internalId of internalIds) {
        const clipId = this.clipByInternalTrack.get(internalId)
        this.adapter?.setTrackMute(internalId, trackMuted
          || Boolean(clipId && this.liveClips.get(clipId)?.muted))
      }
    }
    if (this.playing) this.syncStreams(this.currentTime(), true)
  }

  setTrackVolume(trackId: string, volume: number) {
    this.liveTrackVolumes.set(trackId, volume)
    for (const clip of this.scene.resolved.tracks.find((item) => item.id === trackId)?.clips || []) {
      const internalId = this.internalTrackByClip.get(clip.id)
      if (internalId) this.adapter?.setTrackVolume(
        internalId, volume * (this.liveClipGains.get(clip.id) ?? 1))
    }
    for (const stream of this.streams)
      if (stream.trackId === trackId) stream.trackVolume = volume
    for (const descriptor of this.streamDescriptors.values())
      if (descriptor.trackId === trackId) descriptor.trackVolume = volume
  }

  setClipGain(trackId: string, clipId: string, gain: number) {
    const track = this.scene.resolved.tracks.find((item) => item.id === trackId)
    if (!track) return
    this.liveClipGains.set(clipId, Math.max(0, gain))
    const internalId = this.internalTrackByClip.get(clipId)
    if (internalId) this.adapter?.setTrackVolume(
      internalId,
      (this.liveTrackVolumes.get(trackId) ?? track.volume) * Math.max(0, gain),
    )
  }

  setClipMix(trackId: string, clipId: string, changes: Partial<Pick<
    SoundSceneClip, "muted" | "fade_in_ms" | "fade_out_ms" | "effects" | "ducking" | "duck_amount_db"
  >>) {
    const track = this.scene.resolved.tracks.find((item) => item.id === trackId)
    const original = track?.clips.find((item) => item.id === clipId)
    if (!track || !original) return
    const live = { ...(this.liveClips.get(clipId) || original), ...changes }
    if (changes.effects) live.effects = structuredClone(changes.effects)
    this.liveClips.set(clipId, live)

    const trackMuted = this.liveTrackMutes.get(trackId) ?? track.muted
    const internalId = this.internalTrackByClip.get(clipId)
    if (internalId) {
      this.adapter?.setTrackMute(internalId, trackMuted || live.muted
        || Boolean(this.soloTrackIds.size && !this.soloTrackIds.has(trackId)))
      const buffered = this.bufferedTrackByClip.get(clipId)
      if (buffered && (changes.fade_in_ms !== undefined || changes.fade_out_ms !== undefined)) {
        const last = buffered.clips.length - 1
        const clips = buffered.clips.map((clip, index) => ({
          ...clip,
          fadeIn: index === 0 && live.fade_in_ms
            ? { duration: Math.min(live.fade_in_ms / 1_000, clip.durationSamples / clip.sampleRate), type: "linear" as const }
            : undefined,
          fadeOut: index === last && live.fade_out_ms
            ? { duration: Math.min(live.fade_out_ms / 1_000, clip.durationSamples / clip.sampleRate), type: "linear" as const }
            : undefined,
        }))
        const next = { ...buffered, muted: trackMuted || live.muted, clips }
        this.bufferedTrackByClip.set(clipId, next)
        this.adapter?.updateTrack(internalId, next)
      }
      if (changes.effects) {
        const route = this.effectRoutes.get(clipId)
        if (route) this.rebuildEffectRoute(
          clipId, route.input, route.destination, live.effects, internalId,
        )
      }
      if (changes.ducking !== undefined) {
        if (live.ducking) this.duckedBufferedTracks.add(internalId)
        else this.duckedBufferedTracks.delete(internalId)
      }
      if (changes.ducking !== undefined || changes.duck_amount_db !== undefined)
        this.adapter?.setTrackVolume(internalId,
          (this.liveTrackVolumes.get(trackId) ?? track.volume)
          * (this.liveClipGains.get(clipId) ?? live.gain) * this.duckGain(live))
    }

    const descriptor = this.streamDescriptors.get(clipId)
    if (descriptor) descriptor.clip = live
    const stream = this.audioStreams.get(clipId)
    if (stream) {
      stream.clip = live
      stream.muted = trackMuted || live.muted
      if (changes.effects) {
        const route = this.effectRoutes.get(clipId)
        if (route) this.rebuildEffectRoute(
          clipId, route.input, route.destination, live.effects,
        )
      }
    }
    if (this.playing) this.syncStreams(this.currentTime(), true)
  }

  previewSequenceMix(partPublicId: string, changes: Partial<SequenceMixOverride>) {
    const span = this.scene.resolved.sequence_projection.spans.find(
      (candidate) => candidate.part_public_id === partPublicId,
    )
    if (!span) return
    this.sequenceMixPreviews.set(partPublicId, {
      ...this.sequenceMixPreviews.get(partPublicId), ...changes,
    })
    this.scheduleSequenceMix(this.currentTime())
  }

  diagnostics() {
    return {
      active: this.active,
      decodedBytes: this.cache?.diagnostics().decodedBytes || 0,
      bufferedSources: this.cache?.diagnostics().entries || 0,
      streamedSources: this.streams.length,
      sequenceMode: this.sequenceStream ? "stream" as const : "none" as const,
    }
  }

  dispose() {
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibilityListener)
    this.deactivatePlayout()
    this.soloTrackIds.clear()
    this.meterListeners.clear()
  }
}
