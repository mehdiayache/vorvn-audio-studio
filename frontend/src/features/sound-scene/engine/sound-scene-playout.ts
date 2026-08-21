import { NativePlayoutAdapter } from "@dawcore/transport"

import { audioUrl } from "@/lib/api"
import type { SequenceMixOverride, SoundScene, SoundSceneClip, SoundSceneEffect } from "@/types/domain"
import { DecodedAudioCache, planClipSource } from "./sound-source-manager"

const SAMPLE_RATE = 48_000
const STREAM_PREROLL_SECONDS = 30
const STREAM_RELEASE_BEHIND_SECONDS = 5
const STREAM_READY_TIMEOUT_MS = 8_000
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
  private streamMaster: GainNode | null = null
  private preparedSignature = ""
  private sceneVersion = 0
  private active = false
  private playing = false
  private playhead = 0
  private startedAt = 0
  private streamFrame = 0
  private sequenceStream: SequenceStream | null = null
  private streams: StreamHandle[] = []
  private streamDescriptors = new Map<string, StreamDescriptor>()
  private musicStreams = new Map<string, StreamHandle>()
  private effectRoutes = new Map<string, EffectRoute>()
  private childTracks = new Map<string, string[]>()
  private internalTrackByClip = new Map<string, string>()
  private bufferedTrackByClip = new Map<string, PlayoutTrack>()
  private liveTrackVolumes = new Map<string, number>()
  private liveTrackMutes = new Map<string, boolean>()
  private liveClipGains = new Map<string, number>()
  private liveClips = new Map<string, SoundSceneClip>()
  private preparedTrackIds = new Set<string>()
  private duckedBufferedTracks = new Set<string>()
  private sequenceMixPreviews = new Map<string, Partial<SequenceMixOverride>>()
  private duckLevel = 1
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
    if (this.context && this.adapter && this.cache && this.streamMaster) return true
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
    this.streamMaster = context.createGain()
    this.streamMaster.gain.value = 0
    this.streamMaster.connect(context.destination)
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
    this.sceneVersion += 1
    if (this.streamFrame) cancelAnimationFrame(this.streamFrame)
    this.streamFrame = 0
    for (const stream of this.streams) this.releaseStream(stream)
    this.streams = []
    this.streamDescriptors.clear()
    this.musicStreams.clear()
    this.sequenceStream = null
    this.clearEffectRoutes()
    this.adapter?.dispose()
    void this.context?.close()
    this.cache?.clear()
    this.adapter = null
    this.adapterInitialization = null
    this.context = null
    this.cache = null
    this.streamMaster = null
    this.preparedSignature = ""
    this.childTracks.clear()
    this.internalTrackByClip.clear()
    this.bufferedTrackByClip.clear()
    this.liveTrackVolumes.clear()
    this.liveTrackMutes.clear()
    this.liveClipGains.clear()
    this.liveClips.clear()
    this.preparedTrackIds.clear()
    this.duckedBufferedTracks.clear()
    this.duckLevel = 1
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
    rawGain.connect(this.streamMaster!)
    telephoneSource.connect(telephoneGain)
    telephoneGain.connect(this.streamMaster!)
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
        output.connect(this.streamMaster!)
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
    silentTap.connect(this.streamMaster!)
    nodes.push(detectorGain, analyser, silentTap)
    const handle: SequenceStream = {
      element, nodes, gain: rawGain, trackVolume: 1, muted: false,
      rawGain, telephoneGain, detectorGain, echoBuses, analyser,
    }
    this.streams.push(handle)
    this.sequenceStream = handle
    this.scheduleSequenceMix(this.playhead)
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

  private createMusicStream(descriptor: StreamDescriptor) {
    const { trackId, trackVolume, trackMuted, clip } = descriptor
    const element = this.mediaElement(audioUrl(clip.filename!))
    const source = this.context!.createMediaElementSource(element)
    const nodes: AudioNode[] = [source]
    const gain = this.context!.createGain()
    gain.gain.value = 0
    source.connect(gain)
    this.rebuildEffectRoute(clip.id, gain, this.streamMaster!, clip.effects)
    nodes.push(gain)
    const handle = {
      element, nodes, gain, trackId, clip, trackVolume,
      muted: trackMuted || clip.muted,
    }
    this.streams.push(handle)
    this.musicStreams.set(clip.id, handle)
  }

  private materializeRelevantStreams(time: number) {
    for (const descriptor of this.streamDescriptors.values()) {
      const clip = descriptor.clip
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const end = start + Number(clip.resolved_duration_ms || 0) / 1_000
        + Number(clip.effect_tail_ms || 0) / 1_000
      const relevant = start <= time + STREAM_PREROLL_SECONDS
        && end >= time - STREAM_RELEASE_BEHIND_SECONDS
      const existing = this.musicStreams.get(clip.id)
      if (relevant && !existing) this.createMusicStream(descriptor)
      if (!relevant && existing) {
        this.releaseStream(existing)
        this.musicStreams.delete(clip.id)
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
    this.musicStreams.clear()
    const tracks: PlayoutTrack[] = []
    const childTracks = new Map<string, string[]>()
    const internalTrackByClip = new Map<string, string>()
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
        children.push(internalId)
        const buffer = await this.cache!.get(plan.url)
        const playoutTrack = {
          id: internalId, name: track.name,
          muted: track.muted || clip.muted, soloed: false,
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
        window.clearTimeout(timeout)
        element.removeEventListener(event, finish)
        resolve()
      }
      const timeout = window.setTimeout(finish, STREAM_READY_TIMEOUT_MS)
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
      if (Math.abs(element.currentTime - sourceTime) > .01)
        element.currentTime = sourceTime
      await this.waitForMedia(
        element, "canplay",
        () => Number(element.readyState) >= HAVE_FUTURE_DATA,
      )
    }))
  }

  private syncStreams(time: number, shouldPlay: boolean) {
    this.materializeRelevantStreams(time)
    const starts: Promise<void>[] = []
    const sequence = this.sequenceStream
    if (sequence) {
      if (Math.abs(sequence.element.currentTime - time) > .15)
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
      const gain = stream.muted ? 0 : stream.trackVolume
        * (this.liveClipGains.get(clip.id) ?? live.gain)
        * this.fadeGain(live, Math.max(0, elapsed), duration)
        * (live.ducking ? this.duckLevel : 1)
      stream.gain.gain.value = active ? gain : 0
      if (!active) { stream.element.pause(); continue }
      const sourceTime = this.sourceTime(clip, elapsed)
      if (Math.abs(stream.element.currentTime - sourceTime) > .15)
        stream.element.currentTime = sourceTime
      starts.push(stream.element.play().catch(() => undefined))
    }
    return starts
  }

  private updateDucking() {
    if (!this.sequenceStream) { this.duckLevel = 1; return }
    const samples = new Float32Array(this.sequenceStream.analyser.fftSize)
    this.sequenceStream.analyser.getFloatTimeDomainData(samples)
    const rms = Math.sqrt(samples.reduce(
      (sum, value) => sum + value * value, 0) / samples.length)
    this.duckLevel = rms > .015 ? Math.max(.14, .015 / rms) : 1
    for (const internalId of this.duckedBufferedTracks) {
      const clipId = [...this.internalTrackByClip.entries()]
        .find(([, id]) => id === internalId)?.[0]
      if (!clipId) continue
      const track = this.scene.resolved.tracks.find((candidate) =>
        candidate.clips.some((clip) => clip.id === clipId))
      this.adapter?.setTrackVolume(
        internalId,
        (this.liveTrackVolumes.get(track?.id || "") ?? track?.volume ?? 1)
        * (this.liveClipGains.get(clipId) ?? 1) * this.duckLevel,
      )
    }
  }

  private followStreams() {
    if (this.streamFrame) cancelAnimationFrame(this.streamFrame)
    const update = () => {
      if (!this.playing) { this.streamFrame = 0; return }
      const time = this.currentTime()
      if (time >= this.duration()) { this.pause(); return }
      this.updateDucking()
      this.syncStreams(time, true)
      this.streamFrame = requestAnimationFrame(update)
    }
    this.streamFrame = requestAnimationFrame(update)
  }

  async play(from?: number) {
    await this.activatePlayout()
    if (!await this.initializeAdapter()) return
    if (from !== undefined) this.seek(from)
    await this.context!.resume()
    this.streamMaster!.gain.setValueAtTime(0, this.context!.currentTime)
    await this.prepareStreams(this.playhead)
    this.playing = true
    this.scheduleSequenceMix(this.playhead)
    await Promise.all(this.syncStreams(this.playhead, true))
    if (!this.playing || !this.active) return
    this.startedAt = this.context!.currentTime
    if (this.preparedTrackIds.size)
      this.adapter!.play(this.playhead, this.duration())
    this.streamMaster!.gain.setValueAtTime(1, this.context!.currentTime)
    if (this.streams.length || this.streamDescriptors.size) this.followStreams()
  }

  pause() {
    if (this.playing) this.playhead = this.currentTime()
    this.playing = false
    this.adapter?.pause()
    if (this.streamMaster && this.context)
      this.streamMaster.gain.setValueAtTime(0, this.context.currentTime)
    this.syncStreams(this.playhead, false)
    if (this.streamFrame) cancelAnimationFrame(this.streamFrame)
    this.streamFrame = 0
  }

  seek(seconds: number) {
    this.playhead = Math.max(0, Math.min(this.duration(), seconds))
    if (this.playing && this.context) this.startedAt = this.context.currentTime
    this.adapter?.seek(this.playhead)
    this.scheduleSequenceMix(this.playhead)
    this.syncStreams(this.playhead, this.playing)
  }

  currentTime() {
    if (!this.playing || !this.context) return this.playhead
    return Math.min(this.duration(), this.playhead + this.context.currentTime - this.startedAt)
  }
  isPlaying() { return this.playing }

  muteTrack(trackId: string, muted: boolean) {
    this.liveTrackMutes.set(trackId, muted)
    for (const internalId of this.childTracks.get(trackId) || [])
      this.adapter?.setTrackMute(internalId, muted)
    for (const stream of this.streams)
      if (stream.trackId === trackId) stream.muted = muted || Boolean(stream.clip?.muted)
    for (const descriptor of this.streamDescriptors.values())
      if (descriptor.trackId === trackId) descriptor.trackMuted = muted
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
    SoundSceneClip, "muted" | "fade_in_ms" | "fade_out_ms" | "effects"
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
      this.adapter?.setTrackMute(internalId, trackMuted || live.muted)
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
    }

    const descriptor = this.streamDescriptors.get(clipId)
    if (descriptor) descriptor.clip = live
    const stream = this.musicStreams.get(clipId)
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
  }
}
