import { useSyncExternalStore } from "react"

import type { SoundScene, SoundSceneClip, SoundSceneDocument, SoundSceneTrack, VentureAsset } from "@/types/domain"
import { SoundSceneEngine, type SoundSceneEngineState } from "./sound-scene-engine"
import { SoundScenePlayout } from "./sound-scene-playout"

export type SoundSelection =
  | { kind: "part"; id: number }
  | { kind: "clip"; trackId: string; clipId: string }
  | null

export type SoundSceneSessionSnapshot = {
  scene: SoundScene
  engine: SoundSceneEngineState
  selection: SoundSelection
  playing: boolean
  playhead: number
  saving: boolean
  error: string
}

export type SoundScenePersistence = {
  update: (document: SoundSceneDocument) => Promise<SoundScene>
  undo: () => Promise<SoundScene>
  redo: () => Promise<SoundScene>
}

type Playout = Pick<SoundScenePlayout,
  "replace" | "play" | "pause" | "seek" | "currentTime" | "isPlaying" |
  "muteTrack" | "setTrackVolume" | "setClipGain" | "dispose"
>

export class SoundSceneSession {
  readonly editor: SoundSceneEngine
  readonly playout: Playout
  private listeners = new Set<() => void>()
  private snapshotValue: SoundSceneSessionSnapshot
  private frame = 0
  private disposed = false

  constructor(
    scene: SoundScene,
    private persistence: SoundScenePersistence,
    playout?: Playout,
    private beforePlay?: () => void,
  ) {
    this.editor = new SoundSceneEngine(scene)
    this.playout = playout || new SoundScenePlayout(scene)
    this.snapshotValue = {
      scene,
      engine: this.editor.state(),
      selection: null,
      playing: false,
      playhead: 0,
      saving: false,
      error: "",
    }
    this.editor.onChange((engine) => this.set({ engine }))
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  snapshot = () => this.snapshotValue

  private set(changes: Partial<SoundSceneSessionSnapshot>) {
    if (this.disposed) return
    this.snapshotValue = { ...this.snapshotValue, ...changes }
    this.listeners.forEach((listener) => listener())
  }

  select(selection: SoundSelection) { this.set({ selection }) }
  pause() {
    this.playout.pause()
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.set({ playing: false })
  }

  reconcile(scene: SoundScene) {
    const current = this.snapshotValue.scene
    if (scene.revision === current.revision && scene.resolved.signature === current.resolved.signature) return
    const wasPlaying = this.snapshotValue.playing
    if (wasPlaying && this.frame) cancelAnimationFrame(this.frame)
    if (wasPlaying) this.frame = 0
    this.editor.replace(scene)
    this.set({ scene, engine: this.editor.state() })
    void this.playout.replace(scene).then(() => {
      if (!wasPlaying) return
      const playing = this.playout.isPlaying()
      this.set({ playing, playhead: this.playout.currentTime() })
      if (playing) this.followPlayhead()
    }).catch((reason) => this.set({
      error: reason instanceof Error ? reason.message : "The updated Sound Scene could not be prepared.",
      playing: false,
    }))
  }

  currentClip(trackId: string, clipId: string): SoundSceneClip | null {
    const persisted = this.editor.document().tracks.find((track) => track.id === trackId)?.clips.find((clip) => clip.id === clipId)
    const resolved = this.snapshotValue.scene.resolved.tracks.find((track) => track.id === trackId)?.clips.find((clip) => clip.id === clipId)
    return persisted ? { ...resolved, ...persisted } : null
  }

  beginGesture() { this.editor.beginGesture() }
  moveClip(trackId: string, clipId: string, deltaSamples: number) { this.editor.moveClip(trackId, clipId, deltaSamples) }
  trimClip(trackId: string, clipId: string, edge: "left" | "right", deltaSamples: number) { this.editor.trimClip(trackId, clipId, edge, deltaSamples) }
  cancelGesture() { this.editor.cancelGesture() }
  async commitGesture() {
    this.editor.commitGesture()
    await this.persist(this.editor.document())
  }

  updateClip(trackId: string, clipId: string, changes: Partial<SoundSceneClip>) {
    this.editor.setClipValue(trackId, clipId, changes)
    if (changes.gain !== undefined) this.playout.setClipGain(trackId, clipId, changes.gain)
  }

  async commitClip() { await this.persist(this.editor.document()) }

  private nextDocument(transform: (document: SoundSceneDocument) => void) {
    const document = structuredClone(this.editor.document())
    transform(document)
    return document
  }

  private musicClip(asset: VentureAsset, positionMs: number, followSequence: boolean): SoundSceneClip {
    const sourceDuration = Math.max(100, Number(asset.duration_ms || 30_000))
    return {
      id: crypto.randomUUID(), asset_id: asset.id,
      asset_version_id: Number(asset.version_id) || null,
      duration_ms: followSequence ? null : sourceDuration,
      source_offset_ms: 0, gain: followSequence ? .18 : 1,
      fade_in_ms: followSequence ? 2_000 : 0,
      fade_out_ms: followSequence ? 3_000 : 0,
      loop: followSequence, ducking: followSequence,
      muted: false, locked: false, effects: [],
      anchor: { kind: "absolute", position_ms: positionMs },
    }
  }

  async addTrack(kind: SoundSceneTrack["kind"], asset?: VentureAsset, timelinePosition = 0) {
    const id = `${kind}-${crypto.randomUUID()}`
    const clip = asset ? this.musicClip(asset, Math.max(0, Math.round(timelinePosition * 1000)), true) : null
    await this.persist(this.nextDocument((document) => document.tracks.push({
      id, kind, name: `${kind === "music" ? "Music" : kind} ${document.tracks.filter((track) => track.kind === kind).length + 1}`,
      volume: 1, muted: false, clips: clip ? [clip] : [],
    })))
    if (clip) this.select({ kind: "clip", trackId: id, clipId: clip.id })
    return id
  }

  async removeTrack(trackId: string) {
    await this.persist(this.nextDocument((document) => {
      document.tracks = document.tracks.filter((track) => track.id !== trackId)
    }))
    this.select(null)
  }

  async addClip(trackId: string, asset: VentureAsset, timelinePosition = 0) {
    const clip = this.musicClip(asset, Math.max(0, Math.round(timelinePosition * 1000)), false)
    await this.persist(this.nextDocument((document) => {
      const track = document.tracks.find((item) => item.id === trackId)
      if (!track) throw new Error("That Music track is no longer available.")
      track.clips.push(clip)
    }))
    this.select({ kind: "clip", trackId, clipId: clip.id })
  }

  async replaceClipSource(trackId: string, clipId: string, asset: VentureAsset) {
    await this.persist(this.nextDocument((document) => {
      const clip = document.tracks.find((track) => track.id === trackId)?.clips.find((item) => item.id === clipId)
      if (!clip) throw new Error("That Music clip is no longer available.")
      clip.asset_id = asset.id
      clip.asset_version_id = Number(asset.version_id) || null
      clip.source_offset_ms = 0
      if (!clip.loop) clip.duration_ms = Math.max(100, Number(asset.duration_ms || clip.duration_ms || 30_000))
    }))
  }

  async removeClip(trackId: string, clipId: string) {
    await this.persist(this.nextDocument((document) => {
      const track = document.tracks.find((item) => item.id === trackId)
      if (!track) return
      track.clips = track.clips.filter((clip) => clip.id !== clipId)
    }))
    this.select(null)
  }

  setTrackMute(trackId: string, muted: boolean) {
    this.editor.setTrackMute(trackId, muted)
    this.playout.muteTrack(trackId, muted)
  }
  async commitTrackMute(trackId: string, muted: boolean) {
    this.setTrackMute(trackId, muted)
    await this.persist(this.editor.document())
  }
  setTrackVolume(trackId: string, volume: number) {
    this.editor.setTrackVolume(trackId, volume)
    this.playout.setTrackVolume(trackId, volume)
  }
  async commitTrackVolume(trackId: string, volume: number) {
    this.setTrackVolume(trackId, volume)
    await this.persist(this.editor.document())
  }

  zoomIn() { this.editor.zoomIn() }
  zoomOut() { this.editor.zoomOut() }
  setZoomLevel(samplesPerPixel: number) { this.editor.setZoomLevel(samplesPerPixel) }

  seek(seconds: number) {
    const next = Math.max(0, Math.min(this.duration(), seconds))
    this.playout.seek(next)
    this.editor.seek(next)
    this.set({ playhead: next })
  }

  duration() {
    const resolved = this.snapshotValue.scene.resolved
    return Number(resolved.duration_ms ?? resolved.sequence_projection.duration_ms) / 1000
  }

  async togglePlayback() {
    if (this.snapshotValue.playing) {
      this.playout.pause()
      if (this.frame) cancelAnimationFrame(this.frame)
      this.frame = 0
      this.set({ playing: false })
      return
    }
    this.set({ error: "" })
    try {
      this.beforePlay?.()
      await this.playout.play(this.snapshotValue.playhead)
      this.set({ playing: true })
      this.followPlayhead()
    } catch (reason) {
      this.set({
        playing: false,
        error: reason instanceof Error ? reason.message : "The Sound Scene could not be played.",
      })
    }
  }

  private followPlayhead() {
    if (this.frame) cancelAnimationFrame(this.frame)
    const update = () => {
      if (!this.playout.isPlaying()) {
        this.frame = 0
        this.set({ playing: false, playhead: this.playout.currentTime() })
        return
      }
      this.set({ playhead: this.playout.currentTime() })
      this.frame = requestAnimationFrame(update)
    }
    this.frame = requestAnimationFrame(update)
  }

  private async persist(document: SoundSceneDocument) {
    if (this.snapshotValue.saving) return
    this.set({ saving: true, error: "" })
    try {
      const scene = await this.persistence.update(document)
      this.reconcile(scene)
    } catch (reason) {
      this.editor.replace(this.snapshotValue.scene)
      this.set({
        engine: this.editor.state(),
        error: reason instanceof Error ? reason.message : "That Sound Scene change could not be saved.",
      })
      throw reason
    } finally {
      this.set({ saving: false })
    }
  }

  async undo() {
    if (this.snapshotValue.saving) return
    this.set({ saving: true, error: "" })
    try { this.reconcile(await this.persistence.undo()) }
    finally { this.set({ saving: false }) }
  }
  async redo() {
    if (this.snapshotValue.saving) return
    this.set({ saving: true, error: "" })
    try { this.reconcile(await this.persistence.redo()) }
    finally { this.set({ saving: false }) }
  }

  dispose() {
    this.disposed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.editor.dispose()
    this.playout.dispose()
    this.listeners.clear()
  }
}

export function useSoundSceneSession(session: SoundSceneSession) {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
}
