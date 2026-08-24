import { useSyncExternalStore } from "react"

import type { SequenceMixOverride, SoundScene, SoundSceneClip, SoundSceneDocument, SoundSceneTrack, VentureAsset } from "@/types/domain"
import { dbToGain, gainToDb } from "../sound-scene-gain"
import { SoundSceneEngine, type SoundSceneEngineState } from "./sound-scene-engine"
import { SoundScenePlayout } from "./sound-scene-playout"

export type SoundClipRef = { trackId: string; clipId: string }
export type SoundSelection =
  | { kind: "part"; id: number }
  | { kind: "clip"; trackId: string; clipId: string }
  | { kind: "clips"; clips: SoundClipRef[] }
  | null

export type SoundSceneSessionSnapshot = {
  scene: SoundScene
  engine: SoundSceneEngineState
  selection: SoundSelection
  playback: "idle" | "preparing" | "playing"
  playhead: number
  saving: boolean
  error: string
  soloTrackIds: string[]
}

export type SoundScenePersistence = {
  update: (document: SoundSceneDocument, expectedRevision: number) => Promise<SoundScene>
  undo: () => Promise<SoundScene>
  redo: () => Promise<SoundScene>
}

type Playout = Pick<SoundScenePlayout,
  "replace" | "play" | "pause" | "seek" | "currentTime" | "isPlaying" |
  "muteTrack" | "setTrackVolume" | "setClipGain" | "dispose"
> & Partial<Pick<SoundScenePlayout,
  "activatePlayout" | "deactivatePlayout" | "adopt" | "previewSequenceMix" | "setClipMix" |
  "setSoloTracks" | "subscribeMeter" | "meterSnapshot"
>>

type CommitWaiter = {
  resolve: () => void
  reject: (reason: unknown) => void
}

type PendingCommit = {
  document: SoundSceneDocument
  waiters: CommitWaiter[]
}

function playoutStructure(document: SoundSceneDocument) {
  return {
    version: document.version,
    sequenceEffects: Object.fromEntries(Object.entries(document.sequence_overrides)
      .map(([partId, override]) => [partId, override.effects])),
    tracks: document.tracks.map((track) => ({
      id: track.id,
      kind: track.kind,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        asset_id: clip.asset_id,
        asset_version_id: clip.asset_version_id,
        duration_ms: clip.duration_ms,
        source_offset_ms: clip.source_offset_ms,
        loop: clip.loop,
        anchor: clip.anchor,
      })),
    })),
  }
}

export function isLiveMixOnlyChange(previous: SoundSceneDocument, next: SoundSceneDocument) {
  return JSON.stringify(playoutStructure(previous)) === JSON.stringify(playoutStructure(next))
}

export class SoundSceneSession {
  readonly editor: SoundSceneEngine
  readonly playout: Playout
  private listeners = new Set<() => void>()
  private snapshotValue: SoundSceneSessionSnapshot
  private frame = 0
  private disposed = false
  private pendingCommit: PendingCommit | null = null
  private commitLoop: Promise<void> | null = null

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
      playback: "idle",
      playhead: 0,
      saving: false,
      error: "",
      soloTrackIds: [],
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
  reportError(error: string) { this.set({ error }) }
  selectClip(trackId: string, clipId: string, additive = false) {
    const next = { trackId, clipId }
    if (!additive) { this.select({ kind: "clip", ...next }); return }
    const current = this.selectedClips()
    const exists = current.some((clip) => clip.trackId === trackId && clip.clipId === clipId)
    const clips = exists
      ? current.filter((clip) => clip.trackId !== trackId || clip.clipId !== clipId)
      : [...current, next]
    this.select(clips.length === 0 ? null : clips.length === 1
      ? { kind: "clip", ...clips[0]! }
      : { kind: "clips", clips })
  }
  selectedClips(): SoundClipRef[] {
    const selection = this.snapshotValue.selection
    if (selection?.kind === "clip") return [{ trackId: selection.trackId, clipId: selection.clipId }]
    return selection?.kind === "clips" ? selection.clips : []
  }
  async activatePlayout() {
    try {
      await this.playout.activatePlayout?.()
    } catch (reason) {
      this.set({
        error: reason instanceof Error ? reason.message : "Sound Design audio could not be prepared.",
      })
    }
  }
  deactivatePlayout() {
    this.pause()
    this.playout.deactivatePlayout?.()
  }
  private boundedTime(seconds: number) {
    return Math.max(0, Math.min(this.duration(), Number(seconds) || 0))
  }
  pause() {
    const playhead = this.boundedTime(this.playout.currentTime())
    this.playout.pause()
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.set({ playback: "idle", playhead })
  }

  reconcile(scene: SoundScene, force = false) {
    const current = this.snapshotValue.scene
    if (this.snapshotValue.saving && !force) {
      if (scene.revision > current.revision) this.set({ scene })
      return
    }
    if (scene.revision === current.revision && scene.resolved.signature === current.resolved.signature) return
    const wasPlaying = this.snapshotValue.playback === "playing"
    const canAdoptLiveMix = force && Boolean(this.playout.adopt)
      && isLiveMixOnlyChange(current.document, scene.document)
    if (!canAdoptLiveMix && wasPlaying && this.frame) cancelAnimationFrame(this.frame)
    if (!canAdoptLiveMix && wasPlaying) this.frame = 0
    this.editor.replace(scene)
    const trackIds = new Set(scene.document.tracks.map((track) => track.id))
    const soloTrackIds = this.snapshotValue.soloTrackIds.filter((id) => trackIds.has(id))
    this.playout.setSoloTracks?.(soloTrackIds)
    this.set({ scene, engine: this.editor.state(), soloTrackIds })
    if (canAdoptLiveMix) {
      this.playout.adopt?.(scene)
      return
    }
    void this.playout.replace(scene).then(() => {
      if (!wasPlaying) return
      const playing = this.playout.isPlaying()
      this.set({ playback: playing ? "playing" : "idle", playhead: this.playout.currentTime() })
      if (playing) this.followPlayhead()
    }).catch((reason) => this.set({
      error: reason instanceof Error ? reason.message : "The updated Sound Scene could not be prepared.",
      playback: "idle",
    }))
  }

  currentClip(trackId: string, clipId: string): SoundSceneClip | null {
    const persisted = this.editor.document().tracks.find((track) => track.id === trackId)?.clips.find((clip) => clip.id === clipId)
    const resolved = this.snapshotValue.scene.resolved.tracks.find((track) => track.id === trackId)?.clips.find((clip) => clip.id === clipId)
    return persisted ? { ...resolved, ...persisted } : null
  }

  beginGesture() { this.editor.beginGesture() }
  moveClip(trackId: string, clipId: string, deltaSamples: number) { this.editor.moveClip(trackId, clipId, deltaSamples) }
  canMoveClips(refs: SoundClipRef[]) {
    const locked = refs.some((ref) => this.currentClip(ref.trackId, ref.clipId)?.locked)
    if (locked) this.reportError("Unlock every selected clip before moving the group.")
    return !locked
  }
  moveClips(refs: SoundClipRef[], deltaSamples: number) {
    if (!this.canMoveClips(refs)) return false
    return this.editor.moveClips(refs, deltaSamples)
  }
  trimClip(trackId: string, clipId: string, edge: "left" | "right", deltaSamples: number) { this.editor.trimClip(trackId, clipId, edge, deltaSamples) }
  cancelGesture() { this.editor.cancelGesture() }
  async commitGesture() {
    this.editor.commitGesture()
    await this.persist(this.editor.document())
  }

  updateClip(trackId: string, clipId: string, changes: Partial<SoundSceneClip>) {
    this.editor.setClipValue(trackId, clipId, changes)
    if (changes.gain !== undefined) this.playout.setClipGain(trackId, clipId, changes.gain)
    if (changes.muted !== undefined || changes.fade_in_ms !== undefined
      || changes.fade_out_ms !== undefined || changes.effects !== undefined
      || changes.ducking !== undefined || changes.duck_amount_db !== undefined) {
      this.playout.setClipMix?.(trackId, clipId, changes)
    }
  }

  async commitClip() { await this.persist(this.editor.document()) }

  private nextDocument(transform: (document: SoundSceneDocument) => void) {
    const document = structuredClone(this.editor.document())
    transform(document)
    return document
  }

  private audioClip(asset: VentureAsset, positionMs: number, followSequence: boolean): SoundSceneClip {
    const sourceDuration = Math.max(100, Number(asset.duration_ms || 30_000))
    const category = String(asset.category || asset.kind || "").toLowerCase()
    const isBed = followSequence && (category === "music" || category === "ambience")
    return {
      id: crypto.randomUUID(), asset_id: asset.id,
      asset_version_id: Number(asset.version_id) || null,
      duration_ms: isBed ? null : sourceDuration,
      source_offset_ms: 0, gain: isBed ? .18 : 1,
      fade_in_ms: isBed ? 2_000 : 0,
      fade_out_ms: isBed ? 3_000 : 0,
      loop: isBed, ducking: isBed, duck_amount_db: -12,
      muted: false, locked: false, effects: [],
      anchor: { kind: "absolute", position_ms: positionMs },
    }
  }

  async addTrack(asset?: VentureAsset, timelinePosition = 0) {
    const id = `audio-${crypto.randomUUID()}`
    const clip = asset ? this.audioClip(asset, Math.max(0, Math.round(timelinePosition * 1000)), true) : null
    await this.persist(this.nextDocument((document) => document.tracks.push({
      id, kind: "audio", name: `Audio ${document.tracks.length + 1}`,
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
    const clip = this.audioClip(asset, Math.max(0, Math.round(timelinePosition * 1000)), false)
    await this.persist(this.nextDocument((document) => {
      const track = document.tracks.find((item) => item.id === trackId)
      if (!track) throw new Error("That Audio Track is no longer available.")
      track.clips.push(clip)
    }))
    this.select({ kind: "clip", trackId, clipId: clip.id })
  }

  async replaceClipSource(trackId: string, clipId: string, asset: VentureAsset) {
    await this.persist(this.nextDocument((document) => {
      const clip = document.tracks.find((track) => track.id === trackId)?.clips.find((item) => item.id === clipId)
      if (!clip) throw new Error("That audio clip is no longer available.")
      if (clip.locked) throw new Error("Unlock this clip before replacing its source.")
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
      const clip = track.clips.find((item) => item.id === clipId)
      if (clip?.locked) throw new Error("Unlock this clip before deleting it.")
      track.clips = track.clips.filter((clip) => clip.id !== clipId)
    }))
    this.select(null)
  }

  async removeClips(refs = this.selectedClips()) {
    if (!refs.length) return
    await this.persist(this.nextDocument((document) => {
      for (const ref of refs) {
        const clip = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
        if (clip?.locked) throw new Error("Unlock every selected clip before deleting the group.")
      }
      for (const track of document.tracks) {
        const ids = new Set(refs.filter((ref) => ref.trackId === track.id).map((ref) => ref.clipId))
        track.clips = track.clips.filter((clip) => !ids.has(clip.id))
      }
    }))
    this.select(null)
  }

  async duplicateClips(refs = this.selectedClips()) {
    if (!refs.length) return
    const resolved = refs.flatMap((ref) => {
      const clip = this.currentClip(ref.trackId, ref.clipId)
      return clip ? [{ ref, clip }] : []
    })
    if (resolved.some(({ clip }) => clip.locked))
      throw new Error("Unlock every selected clip before duplicating the group.")
    const groupStart = Math.min(...resolved.map(({ clip }) => Number(clip.resolved_start_ms || 0)))
    const groupEnd = Math.max(...resolved.map(({ clip }) =>
      Number(clip.resolved_start_ms || 0) + Number(clip.resolved_duration_ms || clip.duration_ms || 0)))
    const delta = Math.max(100, groupEnd - groupStart)
    const created: SoundClipRef[] = []
    await this.persist(this.nextDocument((document) => {
      for (const { ref } of resolved) {
        const track = document.tracks.find((item) => item.id === ref.trackId)
        const source = track?.clips.find((item) => item.id === ref.clipId)
        if (!track || !source) continue
        const copy = structuredClone(source)
        copy.id = crypto.randomUUID()
        copy.anchor = copy.anchor.kind === "part"
          ? { ...copy.anchor, offset_ms: copy.anchor.offset_ms + delta }
          : { ...copy.anchor, position_ms: copy.anchor.position_ms + delta }
        track.clips.push(copy)
        created.push({ trackId: track.id, clipId: copy.id })
      }
    }))
    this.select(created.length === 1 ? { kind: "clip", ...created[0]! } : { kind: "clips", clips: created })
  }

  async commitClipChanges(trackId: string, clipId: string, changes: Partial<SoundSceneClip>) {
    this.updateClip(trackId, clipId, changes)
    await this.commitClip()
  }

  async commitSelectedClipChanges(changes: Partial<SoundSceneClip>, refs = this.selectedClips()) {
    if (!refs.length) return
    for (const ref of refs) this.updateClip(ref.trackId, ref.clipId, changes)
    await this.commitClip()
  }

  async commitSelectedClipGainDelta(deltaDb: number, refs = this.selectedClips()) {
    if (!refs.length) return
    for (const ref of refs) {
      const clip = this.currentClip(ref.trackId, ref.clipId)
      if (!clip) continue
      this.updateClip(ref.trackId, ref.clipId, { gain: clip.gain <= .001 ? 0 : dbToGain(gainToDb(clip.gain) + deltaDb) })
    }
    await this.commitClip()
  }

  async updateSequenceOverride(partPublicId: string, changes: Partial<SequenceMixOverride>) {
    const span = this.snapshotValue.scene.resolved.sequence_projection.spans.find((item) => item.part_public_id === partPublicId)
    if (!span) throw new Error("That Sequence Part is no longer available.")
    this.previewSequenceOverride(partPublicId, changes)
    await this.persist(this.nextDocument((document) => {
      document.sequence_overrides[partPublicId] = { ...span.mix, ...document.sequence_overrides[partPublicId], ...changes }
    }))
  }

  previewSequenceOverride(partPublicId: string, changes: Partial<SequenceMixOverride>) {
    this.playout.previewSequenceMix?.(partPublicId, changes)
  }

  async removeSequenceOverride(partPublicId: string) {
    await this.persist(this.nextDocument((document) => { delete document.sequence_overrides[partPublicId] }))
  }

  setTrackMute(trackId: string, muted: boolean) {
    this.editor.setTrackMute(trackId, muted)
    this.playout.muteTrack(trackId, muted)
  }
  async commitTrackMute(trackId: string, muted: boolean) {
    this.setTrackMute(trackId, muted)
    await this.persist(this.editor.document())
  }
  toggleTrackSolo(trackId: string) {
    const current = this.snapshotValue.soloTrackIds
    const soloTrackIds = current.includes(trackId)
      ? current.filter((id) => id !== trackId)
      : [...current, trackId]
    this.playout.setSoloTracks?.(soloTrackIds)
    this.set({ soloTrackIds })
  }
  clearTrackSolos() {
    this.playout.setSoloTracks?.([])
    this.set({ soloTrackIds: [] })
  }

  subscribeMeter = (listener: () => void) => this.playout.subscribeMeter?.(listener) || (() => undefined)
  meterSnapshot = () => this.playout.meterSnapshot?.() || { left: 0, right: 0, peak: 0, clipping: false }
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
    if (this.snapshotValue.playback === "playing") {
      this.pause()
      return
    }
    if (this.snapshotValue.playback === "preparing") return
    this.set({ error: "", playback: "preparing" })
    try {
      this.beforePlay?.()
      await this.playout.play(this.snapshotValue.playhead)
      this.set({ playback: "playing" })
      this.followPlayhead()
    } catch (reason) {
      this.set({
        playback: "idle",
        error: reason instanceof Error ? reason.message : "The Sound Scene could not be played.",
      })
    }
  }

  private followPlayhead() {
    if (this.frame) cancelAnimationFrame(this.frame)
    const update = () => {
      if (!this.playout.isPlaying()) {
        this.frame = 0
        this.set({
          playback: "idle",
          playhead: this.boundedTime(this.playout.currentTime()),
        })
        return
      }
      this.set({ playhead: this.boundedTime(this.playout.currentTime()) })
      this.frame = requestAnimationFrame(update)
    }
    this.frame = requestAnimationFrame(update)
  }

  private persist(document: SoundSceneDocument) {
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject }
      if (this.pendingCommit) {
        this.pendingCommit.document = structuredClone(document)
        this.pendingCommit.waiters.push(waiter)
      } else {
        this.pendingCommit = { document: structuredClone(document), waiters: [waiter] }
      }
      this.startCommitLoop()
    })
  }

  private startCommitLoop() {
    if (this.commitLoop) return
    const loop = this.drainCommits()
    this.commitLoop = loop
    void loop.finally(() => {
      if (this.commitLoop !== loop) return
      this.commitLoop = null
      if (this.pendingCommit) this.startCommitLoop()
    })
  }

  private async drainCommits() {
    this.set({ saving: true, error: "" })
    try {
      while (this.pendingCommit) {
        const commit = this.pendingCommit
        this.pendingCommit = null
        try {
          const scene = await this.persistence.update(
            commit.document, this.snapshotValue.scene.revision,
          )
          if (this.pendingCommit) this.set({ scene })
          else this.reconcile(scene, true)
          commit.waiters.forEach(({ resolve }) => resolve())
        } catch (reason) {
          commit.waiters.forEach(({ reject }) => reject(reason))
          this.rejectPendingCommit(reason)
          this.editor.replace(this.snapshotValue.scene)
          this.set({
            engine: this.editor.state(),
            error: reason instanceof Error ? reason.message : "That Sound Scene change could not be saved.",
          })
          return
        }
      }
    } finally {
      this.set({ saving: false })
    }
  }

  private rejectPendingCommit(reason: unknown) {
    const pending = this.pendingCommit
    this.pendingCommit = null
    pending?.waiters.forEach(({ reject }) => reject(reason))
  }

  async undo() {
    if (this.snapshotValue.saving) return
    this.set({ saving: true, error: "" })
    try { this.reconcile(await this.persistence.undo()) }
    catch (reason) {
      this.set({ error: reason instanceof Error ? reason.message : "The last Sound Design edit could not be undone." })
    }
    finally { this.set({ saving: false }) }
  }
  async redo() {
    if (this.snapshotValue.saving) return
    this.set({ saving: true, error: "" })
    try { this.reconcile(await this.persistence.redo()) }
    catch (reason) {
      this.set({ error: reason instanceof Error ? reason.message : "The Sound Design edit could not be restored." })
    }
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
