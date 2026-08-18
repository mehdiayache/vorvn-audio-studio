import { createTrack, type AudioClip, type ClipTrack } from "@waveform-playlist/core"
import { PlaylistEngine, type EngineState } from "@waveform-playlist/engine"

import type { SoundScene, SoundSceneClip, SoundSceneDocument, SoundSceneTrack } from "@/types/domain"

const SAMPLE_RATE = 48_000
const samples = (milliseconds: number) => Math.max(0, Math.round(milliseconds * SAMPLE_RATE / 1000))
const milliseconds = (sampleCount: number) => Math.max(0, Math.round(sampleCount * 1000 / SAMPLE_RATE))

type ClipOrigin = {
  clip: SoundSceneClip
  track: SoundSceneTrack
  resolvedStartMs: number
  resolvedDurationMs: number
}

export type SoundSceneEngineState = EngineState

function engineClip(id: string, name: string, startMs: number, durationMs: number, sourceDurationMs: number, offsetMs = 0, gain = 1, fadeInMs = 0, fadeOutMs = 0): AudioClip {
  return {
    id,
    startSample: samples(startMs),
    durationSamples: Math.max(samples(100), samples(durationMs)),
    offsetSamples: samples(offsetMs),
    sampleRate: SAMPLE_RATE,
    sourceDurationSamples: Math.max(samples(100), samples(sourceDurationMs || durationMs)),
    gain,
    name,
    fadeIn: fadeInMs ? { duration: fadeInMs / 1000, type: "linear" } : undefined,
    fadeOut: fadeOutMs ? { duration: fadeOutMs / 1000, type: "linear" } : undefined,
  }
}

function voiceTrack(scene: SoundScene): ClipTrack {
  return {
    ...createTrack({ name: "Voice Projection", color: "#6d28d9" }),
    id: "voice-projection",
    clips: scene.resolved.voice_projection.spans.map((span) => engineClip(
      `voice:${span.part_id}`,
      span.role || span.voice_name || span.title || `Part ${span.position ?? ""}`,
      span.start_ms,
      span.duration_ms,
      span.duration_ms,
    )),
  }
}

function soundTrack(track: SoundSceneTrack): ClipTrack {
  return {
    ...createTrack({
      name: track.name,
      muted: track.muted,
      color: track.kind === "music" ? "#0f766e" : "#c2410c",
    }),
    id: track.id,
    clips: track.clips.filter((clip) => !clip.orphan).map((clip) => {
      const duration = Number(clip.resolved_duration_ms ?? clip.duration_ms ?? 100)
      const physicalSource = Number(clip.source_duration_ms || duration || 100)
      const editableSource = clip.loop
        ? Math.max(physicalSource, duration + clip.source_offset_ms)
        : physicalSource
      return engineClip(
        clip.id,
        clip.asset_name || track.name,
        Number(clip.resolved_start_ms ?? clip.start_ms),
        duration,
        editableSource,
        clip.source_offset_ms,
        clip.gain,
        clip.fade_in_ms,
        clip.fade_out_ms,
      )
    }),
  }
}

export class SoundSceneEngine {
  readonly engine: PlaylistEngine
  private readonly origins = new Map<string, ClipOrigin>()
  private readonly baseDocument: SoundSceneDocument

  constructor(readonly scene: SoundScene) {
    this.baseDocument = structuredClone(scene.document)
    scene.resolved.tracks.forEach((track) => track.clips.forEach((clip) => {
      const persisted = scene.document.tracks.find((item) => item.id === track.id)?.clips.find((item) => item.id === clip.id)
      if (persisted) this.origins.set(clip.id, {
        clip: persisted,
        track,
        resolvedStartMs: Number(clip.resolved_start_ms ?? clip.start_ms),
        resolvedDurationMs: Number(clip.resolved_duration_ms ?? clip.duration_ms ?? 0),
      })
    }))
    this.engine = new PlaylistEngine({
      sampleRate: SAMPLE_RATE,
      samplesPerPixel: 4_800,
      zoomLevels: [12_000, 9_600, 7_200, 4_800, 3_200, 2_400, 1_600, 1_200],
      undoLimit: 80,
    })
    this.engine.setTracks([
      voiceTrack(scene),
      ...scene.resolved.tracks.map(soundTrack),
    ])
  }

  state(): EngineState { return this.engine.getState() }
  onChange(listener: (state: EngineState) => void) {
    this.engine.on("statechange", listener)
    return () => this.engine.off("statechange", listener)
  }
  selectTrack(trackId: string | null) { this.engine.selectTrack(trackId) }
  beginGesture() { this.engine.beginTransaction() }
  commitGesture() { this.engine.commitTransaction() }
  cancelGesture() { this.engine.abortTransaction() }
  moveClip(trackId: string, clipId: string, deltaSamples: number) {
    return this.engine.moveClip(trackId, clipId, Math.round(deltaSamples), true)
  }
  trimClip(trackId: string, clipId: string, edge: "left" | "right", deltaSamples: number) {
    this.engine.trimClip(trackId, clipId, edge, Math.round(deltaSamples), true)
  }
  setTrackMute(trackId: string, muted: boolean) { this.engine.setTrackMute(trackId, muted) }
  setClipValue(trackId: string, clipId: string, changes: { gain?: number; fadeInMs?: number; fadeOutMs?: number }) {
    const track = this.state().tracks.find((item) => item.id === trackId)
    if (!track) return
    const next = {
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        gain: changes.gain ?? clip.gain,
        fadeIn: changes.fadeInMs === undefined ? clip.fadeIn : changes.fadeInMs ? { duration: changes.fadeInMs / 1000, type: "linear" as const } : undefined,
        fadeOut: changes.fadeOutMs === undefined ? clip.fadeOut : changes.fadeOutMs ? { duration: changes.fadeOutMs / 1000, type: "linear" as const } : undefined,
      } : clip),
    }
    this.engine.updateTrack(trackId, next)
  }
  zoomIn() { this.engine.zoomIn() }
  zoomOut() { this.engine.zoomOut() }
  seek(seconds: number) { this.engine.seek(seconds) }
  undo() { this.engine.undo() }
  redo() { this.engine.redo() }
  dispose() { this.engine.dispose() }

  document(overrides: Record<string, Partial<SoundSceneClip>> = {}): SoundSceneDocument {
    const state = this.state()
    return {
      version: 1,
      tracks: this.baseDocument.tracks.map((track) => {
        const engineTrack = state.tracks.find((item) => item.id === track.id)
        return {
          ...track,
          muted: engineTrack?.muted ?? track.muted,
          clips: track.clips.map((clip) => {
            const current = engineTrack?.clips.find((item) => item.id === clip.id)
            const origin = this.origins.get(clip.id)
            if (!current || !origin) return { ...clip, ...overrides[clip.id] }
            const currentStart = milliseconds(current.startSample)
            const currentDuration = milliseconds(current.durationSamples)
            const movedBy = currentStart - origin.resolvedStartMs
            const anchor = clip.anchor.kind === "part"
              ? { ...clip.anchor, offset_ms: clip.anchor.offset_ms + movedBy }
              : { kind: "absolute" as const, position_ms: currentStart }
            const unchangedFollowDuration = clip.duration_ms === null && currentDuration === origin.resolvedDurationMs
            return {
              ...clip,
              ...overrides[clip.id],
              start_ms: currentStart,
              duration_ms: unchangedFollowDuration ? null : currentDuration,
              source_offset_ms: clip.loop && Number(clip.source_duration_ms || 0) > 0
                ? milliseconds(current.offsetSamples) % Number(clip.source_duration_ms)
                : milliseconds(current.offsetSamples),
              gain: current.gain,
              fade_in_ms: Math.round((current.fadeIn?.duration || 0) * 1000),
              fade_out_ms: Math.round((current.fadeOut?.duration || 0) * 1000),
              anchor,
            }
          }),
        }
      }),
    }
  }
}
