import { useSyncExternalStore } from "react"

import type { SequenceMixOverride, SoundScene, SoundSceneClip, SoundSceneDocument, SoundSceneTrack, VentureAsset, VisualSceneDocument } from "@/types/domain"
import { dbToGain, gainToDb } from "../sound-scene-gain"
import { SoundSceneEngine, type SoundSceneEngineState } from "./sound-scene-engine"
import { SoundScenePlayout } from "./sound-scene-playout"
import { synchronizeVideoAudio } from "./video-audio-sync"

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
  playbackRange: { start: number; end: number; loop: boolean } | null
  revisionKind: SoundSceneRevisionKind
}

export type SoundSceneMutationKind = "operator" | "derived_visual_audio"
export type SoundSceneRevisionKind = SoundSceneMutationKind | "history" | "external"

export type SoundScenePersistence = {
  update: (document: SoundSceneDocument, expectedRevision: number, mutationKind?: SoundSceneMutationKind) => Promise<SoundScene>
  undo: () => Promise<SoundScene>
  redo: () => Promise<SoundScene>
}

function audioTrackType(value?: string | null) {
  const category = String(value || "").trim().toLowerCase()
  if (category === "music") return "Music"
  if (category === "sfx") return "SFX"
  if (category === "ambience") return "Ambience"
  if (category === "intro") return "Intro"
  if (category === "outro") return "Outro"
  return "Audio"
}

function assetTrackType(asset?: VentureAsset) {
  return audioTrackType(String(asset?.category || asset?.kind || ""))
}

export function soundTrackDisplayName(track: SoundSceneTrack) {
  if (track.clips.length > 0 && track.clips.every(
      (clip) => clip.source_media_type === "video")) return "Video audio"
  const types = new Set(track.clips.map((clip) => audioTrackType(clip.asset_kind)))
  const declared = audioTrackType(track.name)
  if (types.size === 1) {
    const resolved = [...types][0]!
    return resolved === "Audio" && declared !== "Audio" ? declared : resolved
  }
  if (types.size > 1) return "Audio"
  return declared === "Audio" ? "Audio" : declared
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
  mutationKind: SoundSceneMutationKind
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
        linked_visual_clip_id: clip.linked_visual_clip_id,
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
  private visualAudioSignature = ""

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
      playbackRange: null,
      revisionKind: "external",
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

  select(selection: SoundSelection) { this.set({ selection, error: "" }) }
  reportError(error: string) { this.set({ error }) }
  clearError() { this.set({ error: "" }) }
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
        error: reason instanceof Error ? reason.message : "Timeline audio could not be prepared.",
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

  selectedRange(refs = this.selectedClips()) {
    const clips = refs.flatMap((ref) => {
      const clip = this.currentClip(ref.trackId, ref.clipId)
      if (!clip || clip.orphan) return []
      const start = Number(clip.resolved_start_ms || 0) / 1_000
      const duration = Number(clip.resolved_duration_ms || clip.duration_ms || 0) / 1_000
      return duration > 0 ? [{ start, end: start + duration }] : []
    })
    if (!clips.length) return null
    return {
      start: Math.min(...clips.map((clip) => clip.start)),
      end: Math.max(...clips.map((clip) => clip.end)),
    }
  }

  reconcile(scene: SoundScene, force = false, revisionKind: SoundSceneRevisionKind = "external") {
    const current = this.snapshotValue.scene
    // A parent refresh can finish after a newer local commit. Never let that
    // older response move the canonical Sound Scene revision backwards.
    if (!force && scene.revision < current.revision) return
    if (this.snapshotValue.saving && !force) {
      // The in-flight persistence response is the only response that may
      // reconcile this commit. Adopting an eager parent refresh here would
      // advance `scene` without advancing the editor document, leaving the
      // session split between two revisions. Video-audio synchronization would
      // then keep rediscovering and resaving the same derived change.
      return
    }
    if (scene.revision === current.revision && scene.resolved.signature === current.resolved.signature) {
      if (revisionKind !== this.snapshotValue.revisionKind) this.set({ revisionKind })
      return
    }
    const wasPlaying = this.snapshotValue.playback === "playing"
    const canAdoptLiveMix = force && Boolean(this.playout.adopt)
      && isLiveMixOnlyChange(current.document, scene.document)
    if (!canAdoptLiveMix && wasPlaying && this.frame) cancelAnimationFrame(this.frame)
    if (!canAdoptLiveMix && wasPlaying) this.frame = 0
    this.editor.replace(scene)
    const trackIds = new Set(scene.document.tracks.map((track) => track.id))
    const soloTrackIds = this.snapshotValue.soloTrackIds.filter((id) => trackIds.has(id))
    this.playout.setSoloTracks?.(soloTrackIds)
    this.set({ scene, engine: this.editor.state(), soloTrackIds, revisionKind })
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
      error: reason instanceof Error ? reason.message : "The updated Timeline could not be prepared.",
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

  async syncVisualAudio(visual: VisualSceneDocument, assets: VentureAsset[]) {
    const videoAssetIds = new Set(visual.tracks.flatMap((track) =>
      track.media_type === "video" ? track.clips.map((clip) => clip.asset_id) : []))
    const signature = JSON.stringify({
      clips: visual.tracks.flatMap((track) => track.media_type === "video"
        ? track.clips.map(({ id, asset_id, start_ms, duration_ms, source_offset_ms }) =>
          [id, asset_id, start_ms, duration_ms, source_offset_ms])
        : []),
      assets: assets.filter(({ id }) => videoAssetIds.has(id)).map((asset) => [
        asset.id, asset.version_id, asset.sample_rate, asset.channels,
        asset.metadata?.audio_codec, asset.version_metadata?.audio_codec,
      ]),
    })
    if (signature === this.visualAudioSignature) return false
    this.visualAudioSignature = signature
    const synchronized = synchronizeVideoAudio(
      this.editor.document(), visual, assets,
    )
    if (!synchronized.changed) return false
    try {
      await this.persist(synchronized.document, "derived_visual_audio")
      return true
    } catch (reason) {
      if (this.visualAudioSignature === signature) this.visualAudioSignature = ""
      throw reason
    }
  }

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
      id, kind: "audio", name: assetTrackType(asset),
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
      if (!track.clips.length && (track.name === "Audio" || /^Audio \d+$/.test(track.name)))
        track.name = assetTrackType(asset)
      else if (track.clips.length === 1 && (
        track.name === "Music" || /^Audio \d+$/.test(track.name)
        || track.name === String(track.clips[0]?.asset_name || "").trim()
      )) track.name = "Audio"
      track.clips.push(clip)
    }))
    this.select({ kind: "clip", trackId, clipId: clip.id })
  }

  async renameTrack(trackId: string, name: string) {
    const next = name.trim()
    if (!next) throw new Error("Track name cannot be empty.")
    await this.persist(this.nextDocument((document) => {
      const track = document.tracks.find((item) => item.id === trackId)
      if (!track) throw new Error("That Audio Track is no longer available.")
      track.name = next.slice(0, 80)
    }))
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

  async splitClipsAtPlayhead(refs = this.selectedClips(), playheadSeconds = this.snapshotValue.playhead) {
    if (!refs.length) return false
    const candidates = this.splitCandidatesAtPlayhead(refs, playheadSeconds)
    if (!candidates.length) {
      this.reportError("Place the playhead inside a selected clip, at least 0.1 seconds from either edge.")
      return false
    }
    if (candidates.some(({ clip }) => clip.locked)) {
      this.reportError("Unlock every clip under the playhead before splitting.")
      return false
    }
    const created: SoundClipRef[] = []
    await this.persist(this.nextDocument((document) => {
      for (const { ref, clip: resolved, localMs, durationMs } of candidates) {
        const track = document.tracks.find((item) => item.id === ref.trackId)
        const source = track?.clips.find((item) => item.id === ref.clipId)
        if (!track || !source) continue
        const right = structuredClone(source)
        right.id = crypto.randomUUID()
        right.duration_ms = durationMs - localMs
        right.source_offset_ms = source.source_offset_ms + localMs
        const physicalDuration = Number(resolved.source_duration_ms || 0)
        if (source.loop && physicalDuration > 0) right.source_offset_ms %= physicalDuration
        right.anchor = source.anchor.kind === "part"
          ? { ...source.anchor, offset_ms: source.anchor.offset_ms + localMs }
          : { ...source.anchor, position_ms: Number(resolved.resolved_start_ms || source.anchor.position_ms) + localMs }
        right.fade_in_ms = 0
        source.duration_ms = localMs
        source.fade_out_ms = 0
        track.clips.push(right)
        created.push(ref, { trackId: track.id, clipId: right.id })
      }
    }))
    this.select(created.length === 1 ? { kind: "clip", ...created[0]! } : { kind: "clips", clips: created })
    return true
  }

  private splitCandidatesAtPlayhead(refs: SoundClipRef[], playheadSeconds: number) {
    const playheadMs = Math.round(this.boundedTime(playheadSeconds) * 1_000)
    return refs.flatMap((ref) => {
      const clip = this.currentClip(ref.trackId, ref.clipId)
      if (!clip || clip.orphan) return []
      const startMs = Number(clip.resolved_start_ms || 0)
      const durationMs = Number(clip.resolved_duration_ms || clip.duration_ms || 0)
      const localMs = playheadMs - startMs
      return localMs >= 100 && durationMs - localMs >= 100 ? [{ ref, clip, localMs, durationMs }] : []
    })
  }

  canSplitClipsAtPlayhead(refs = this.selectedClips(), playheadSeconds = this.snapshotValue.playhead) {
    return this.splitCandidatesAtPlayhead(refs, playheadSeconds).length > 0
  }

  async nudgeClips(deltaMs: number, refs = this.selectedClips()) {
    if (!refs.length || !deltaMs) return false
    const resolved = refs.flatMap((ref) => {
      const clip = this.currentClip(ref.trackId, ref.clipId)
      return clip ? [{ ref, clip }] : []
    })
    if (resolved.some(({ clip }) => clip.locked)) {
      this.reportError("Unlock every selected clip before nudging the group.")
      return false
    }
    const earliest = Math.min(...resolved.map(({ clip }) => Number(clip.resolved_start_ms || 0)))
    const boundedDelta = Math.max(Math.round(deltaMs), -earliest)
    await this.persist(this.nextDocument((document) => {
      for (const { ref } of resolved) {
        const clip = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
        if (!clip) continue
        clip.anchor = clip.anchor.kind === "part"
          ? { ...clip.anchor, offset_ms: clip.anchor.offset_ms + boundedDelta }
          : { ...clip.anchor, position_ms: clip.anchor.position_ms + boundedDelta }
      }
    }))
    return true
  }

  crossfadeOverlap(refs = this.selectedClips()) {
    if (refs.length !== 2 || refs[0]?.trackId !== refs[1]?.trackId) return null
    const clips = refs.flatMap((ref) => {
      const clip = this.currentClip(ref.trackId, ref.clipId)
      return clip ? [{ ref, clip }] : []
    }).sort((left, right) => Number(left.clip.resolved_start_ms || 0) - Number(right.clip.resolved_start_ms || 0))
    if (clips.length !== 2 || clips.some(({ clip }) => clip.locked)) return null
    const leftEnd = Number(clips[0]!.clip.resolved_start_ms || 0)
      + Number(clips[0]!.clip.resolved_duration_ms || clips[0]!.clip.duration_ms || 0)
    const rightStart = Number(clips[1]!.clip.resolved_start_ms || 0)
    const overlapMs = leftEnd - rightStart
    return overlapMs >= 20 ? { left: clips[0]!.ref, right: clips[1]!.ref, overlapMs } : null
  }

  async crossfadeSelected(refs = this.selectedClips()) {
    const overlap = this.crossfadeOverlap(refs)
    if (!overlap) {
      this.reportError("Select two overlapping, unlocked clips on the same track to create a crossfade.")
      return false
    }
    await this.persist(this.nextDocument((document) => {
      const track = document.tracks.find((item) => item.id === overlap.left.trackId)
      const left = track?.clips.find((clip) => clip.id === overlap.left.clipId)
      const right = track?.clips.find((clip) => clip.id === overlap.right.clipId)
      if (!left || !right) return
      left.fade_out_ms = overlap.overlapMs
      right.fade_in_ms = overlap.overlapMs
    }))
    return true
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
    if (!span) throw new Error("That Script Part is no longer available.")
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
    this.set({ playhead: next, error: "" })
  }

  async playSelection(loop = false, refs = this.selectedClips()) {
    const range = this.selectedRange(refs)
    if (!range || range.end - range.start < .01) {
      this.reportError("Select one or more audio clips to play their range.")
      return false
    }
    if (this.snapshotValue.playback !== "idle") this.pause()
    this.seek(range.start)
    this.set({ playbackRange: { ...range, loop } })
    await this.togglePlayback(true)
    return this.snapshotValue.playback === "playing"
  }

  clearPlaybackRange() { this.set({ playbackRange: null }) }

  duration() {
    const resolved = this.snapshotValue.scene.resolved
    return Number(resolved.duration_ms ?? resolved.sequence_projection.duration_ms) / 1000
  }

  async togglePlayback(preserveRange = false) {
    if (this.snapshotValue.playback === "playing") {
      this.pause()
      return
    }
    if (this.snapshotValue.playback === "preparing") return
    if (!preserveRange) this.set({ playbackRange: null })
    this.set({ error: "", playback: "preparing" })
    try {
      this.beforePlay?.()
      await this.playout.play(this.snapshotValue.playhead)
      this.set({ playback: "playing" })
      this.followPlayhead()
    } catch (reason) {
      this.set({
        playback: "idle",
        error: reason instanceof Error ? reason.message : "The Timeline could not be played.",
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
      const playhead = this.boundedTime(this.playout.currentTime())
      const range = this.snapshotValue.playbackRange
      if (range && playhead >= range.end - .005) {
        if (range.loop) {
          this.seek(range.start)
          this.frame = requestAnimationFrame(update)
          return
        }
        this.pause()
        this.seek(range.end)
        this.set({ playbackRange: null })
        return
      }
      this.set({ playhead })
      this.frame = requestAnimationFrame(update)
    }
    this.frame = requestAnimationFrame(update)
  }

  private persist(document: SoundSceneDocument, mutationKind: SoundSceneMutationKind = "operator") {
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject }
      if (this.pendingCommit) {
        this.pendingCommit.document = structuredClone(document)
        if (mutationKind === "operator") this.pendingCommit.mutationKind = "operator"
        this.pendingCommit.waiters.push(waiter)
      } else {
        this.pendingCommit = { document: structuredClone(document), mutationKind, waiters: [waiter] }
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
          // The action wrapper refreshes parent data before it resolves. Mark
          // provenance first so that an early parent reconciliation cannot
          // misclassify derived video audio as an operator audio edit.
          this.set({ revisionKind: commit.mutationKind })
          const scene = await this.persistence.update(
            commit.document, this.snapshotValue.scene.revision,
            commit.mutationKind,
          )
          if (this.pendingCommit) this.set({ scene, revisionKind: commit.mutationKind })
          else this.reconcile(scene, true, commit.mutationKind)
          commit.waiters.forEach(({ resolve }) => resolve())
        } catch (reason) {
          commit.waiters.forEach(({ reject }) => reject(reason))
          this.rejectPendingCommit(reason)
          this.editor.replace(this.snapshotValue.scene)
          this.set({
            engine: this.editor.state(),
            error: reason instanceof Error ? reason.message : "That Timeline change could not be saved.",
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
    this.set({ saving: true, error: "", revisionKind: "history" })
    try { this.reconcile(await this.persistence.undo(), false, "history") }
    catch (reason) {
      this.set({ error: reason instanceof Error ? reason.message : "The last Timeline edit could not be undone." })
    }
    finally { this.set({ saving: false }) }
  }
  async redo() {
    if (this.snapshotValue.saving) return
    this.set({ saving: true, error: "", revisionKind: "history" })
    try { this.reconcile(await this.persistence.redo(), false, "history") }
    catch (reason) {
      this.set({ error: reason instanceof Error ? reason.message : "The Timeline edit could not be restored." })
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
