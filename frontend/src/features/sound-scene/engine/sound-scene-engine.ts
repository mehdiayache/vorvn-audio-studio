import { createTrack, type AudioClip, type ClipTrack } from "@waveform-playlist/core"
import { PlaylistEngine, type EngineState } from "@waveform-playlist/engine"

import type { SoundScene, SoundSceneClip, SoundSceneDocument, SoundSceneTrack } from "@/types/domain"

const SAMPLE_RATE = 48_000
const samples = (milliseconds: number) => Math.max(0, Math.round(milliseconds * SAMPLE_RATE / 1000))
const milliseconds = (sampleCount: number) => Math.max(0, Math.round(sampleCount * 1000 / SAMPLE_RATE))

type ClipOrigin = {
  clip: SoundSceneClip
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

function sequenceTrack(scene: SoundScene): ClipTrack {
  return {
    ...createTrack({ name: "Sequence", color: "#6d28d9" }),
    id: "sequence-projection",
    clips: scene.resolved.sequence_projection.spans.map((span) => engineClip(
      `sequence:${span.part_public_id}`,
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
      volume: track.volume,
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
        Number(clip.resolved_start_ms ?? (clip.anchor.kind === "absolute" ? clip.anchor.position_ms : 0)),
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
  private scene: SoundScene
  private origins = new Map<string, ClipOrigin>()
  private clipOverrides = new Map<string, Partial<SoundSceneClip>>()
  private baseDocument: SoundSceneDocument

  constructor(scene: SoundScene) {
    this.scene = scene
    this.baseDocument = structuredClone(scene.document)
    this.engine = new PlaylistEngine({
      sampleRate: SAMPLE_RATE,
      samplesPerPixel: 4_800,
      zoomLevels: [300, 400, 600, 800, 1_200, 1_600, 2_400, 3_200, 4_800, 7_200, 9_600, 12_000],
      undoLimit: 80,
    })
    this.replace(scene)
  }

  replace(scene: SoundScene) {
    this.scene = scene
    this.baseDocument = structuredClone(scene.document)
    this.origins = new Map()
    this.clipOverrides = new Map()
    scene.resolved.tracks.forEach((track) => track.clips.forEach((clip) => {
      const persisted = scene.document.tracks.find((item) => item.id === track.id)?.clips.find((item) => item.id === clip.id)
      if (persisted) this.origins.set(clip.id, {
        clip: persisted,
        resolvedStartMs: Number(clip.resolved_start_ms ?? (
          clip.anchor.kind === "absolute" ? clip.anchor.position_ms : 0
        )),
        resolvedDurationMs: Number(clip.resolved_duration_ms ?? clip.duration_ms ?? 0),
      })
    }))
    this.engine.setTracks([sequenceTrack(scene), ...scene.resolved.tracks.map(soundTrack)])
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
    if (this.origins.get(clipId)?.clip.locked) return false
    return this.engine.moveClip(trackId, clipId, Math.round(deltaSamples), true)
  }
  trimClip(trackId: string, clipId: string, edge: "left" | "right", deltaSamples: number) {
    if (this.origins.get(clipId)?.clip.locked) return false
    this.engine.trimClip(trackId, clipId, edge, Math.round(deltaSamples), true)
    return true
  }
  setTrackMute(trackId: string, muted: boolean) { this.engine.setTrackMute(trackId, muted) }
  setTrackVolume(trackId: string, volume: number) { this.engine.setTrackVolume(trackId, volume) }
  setClipValue(trackId: string, clipId: string, changes: Partial<SoundSceneClip>) {
    const track = this.state().tracks.find((item) => item.id === trackId)
    if (!track) return
    this.clipOverrides.set(clipId, {
      ...this.clipOverrides.get(clipId),
      ...changes,
    })
    this.engine.updateTrack(trackId, {
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        gain: changes.gain ?? clip.gain,
        offsetSamples: changes.source_offset_ms === undefined ? clip.offsetSamples : samples(changes.source_offset_ms),
        durationSamples: changes.duration_ms === undefined || changes.duration_ms === null ? clip.durationSamples : samples(changes.duration_ms),
        fadeIn: changes.fade_in_ms === undefined ? clip.fadeIn : changes.fade_in_ms ? { duration: changes.fade_in_ms / 1000, type: "linear" as const } : undefined,
        fadeOut: changes.fade_out_ms === undefined ? clip.fadeOut : changes.fade_out_ms ? { duration: changes.fade_out_ms / 1000, type: "linear" as const } : undefined,
      } : clip),
    })
  }
  zoomIn() { this.engine.zoomIn() }
  zoomOut() { this.engine.zoomOut() }
  setZoomLevel(samplesPerPixel: number) { this.engine.setZoomLevel(samplesPerPixel) }
  seek(seconds: number) { this.engine.seek(seconds) }
  undo() { this.engine.undo() }
  redo() { this.engine.redo() }
  dispose() { this.engine.dispose() }

  document(): SoundSceneDocument {
    const state = this.state()
    return {
      version: 1,
      sequence_overrides: structuredClone(this.baseDocument.sequence_overrides),
      tracks: this.baseDocument.tracks.map((track) => {
        const engineTrack = state.tracks.find((item) => item.id === track.id)
        return {
          ...track,
          volume: engineTrack?.volume ?? track.volume,
          muted: engineTrack?.muted ?? track.muted,
          clips: track.clips.map((clip) => {
            const current = engineTrack?.clips.find((item) => item.id === clip.id)
            const origin = this.origins.get(clip.id)
            if (!current || !origin) return clip
            const currentStart = milliseconds(current.startSample)
            const currentDuration = milliseconds(current.durationSamples)
            const movedBy = currentStart - origin.resolvedStartMs
            const anchor = clip.anchor.kind === "part"
              ? { ...clip.anchor, offset_ms: clip.anchor.offset_ms + movedBy }
              : { kind: "absolute" as const, position_ms: currentStart }
            const unchangedFollowDuration = clip.duration_ms === null && currentDuration === origin.resolvedDurationMs
            const override = this.clipOverrides.get(clip.id)
            return {
              ...clip,
              duration_ms: unchangedFollowDuration ? null : currentDuration,
              source_offset_ms: clip.loop && Number(clip.source_duration_ms || 0) > 0
                ? milliseconds(current.offsetSamples) % Number(clip.source_duration_ms)
                : milliseconds(current.offsetSamples),
              gain: current.gain,
              fade_in_ms: Math.round((current.fadeIn?.duration || 0) * 1000),
              fade_out_ms: Math.round((current.fadeOut?.duration || 0) * 1000),
              anchor,
              ...override,
            }
          }),
        }
      }),
    }
  }
}
