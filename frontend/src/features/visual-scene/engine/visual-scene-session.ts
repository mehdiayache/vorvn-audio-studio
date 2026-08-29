import { useSyncExternalStore } from "react"

import type { VentureAsset, VisualScene, VisualSceneClip, VisualSceneDocument, VisualSceneTrack } from "@/types/domain"

export type VisualClipRef = { trackId: string; clipId: string }
export type VisualSceneSelection = VisualClipRef | { clips: VisualClipRef[] } | null

export function visualSelectionRefs(selection: VisualSceneSelection): VisualClipRef[] {
  return !selection ? [] : "clips" in selection ? selection.clips : [selection]
}

type Snapshot = {
  scene: VisualScene
  document: VisualSceneDocument
  selection: VisualSceneSelection
  saving: boolean
  error: string
  canUndo: boolean
  canRedo: boolean
}

type Persistence = {
  update: (document: VisualSceneDocument, expectedRevision: number) => Promise<VisualScene>
}

const MIN_CLIP_MS = 100
const DEFAULT_IMAGE_MS = 5_000

function cloneDocument(document: VisualSceneDocument): VisualSceneDocument {
  return { ...document, canvas: { ...document.canvas }, tracks: document.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) })) }
}

function uuid() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `visual-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class VisualSceneSession {
  private listeners = new Set<() => void>()
  private draft: VisualSceneDocument | null = null
  private pending: Array<{
    document: VisualSceneDocument
    previous: VisualSceneDocument
    recordHistory: boolean
    resolve: () => void
    reject: (reason: unknown) => void
  }> = []
  private drain: Promise<void> | null = null
  private undoStack: VisualSceneDocument[] = []
  private redoStack: VisualSceneDocument[] = []
  private state: Snapshot

  constructor(scene: VisualScene, private readonly persistence: Persistence, private timelineDurationMs: number) {
    this.state = { scene, document: scene.document, selection: null, saving: false, error: "", canUndo: false, canRedo: false }
  }

  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit() { this.listeners.forEach((listener) => listener()) }
  private set(changes: Partial<Snapshot>) { this.state = { ...this.state, ...changes }; this.emit() }

  setTimelineDuration(durationMs: number) { this.timelineDurationMs = Math.max(0, durationMs) }
  reconcile(scene: VisualScene) {
    if (this.state.saving || this.draft) return
    if (scene.revision !== this.state.scene.revision) {
      this.undoStack = []
      this.redoStack = []
    }
    this.set({ scene, document: scene.document, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 })
  }
  select(selection: VisualSceneSelection) { this.set({ selection }) }
  selectClip(ref: VisualClipRef, toggle = false) {
    if (!toggle) { this.select(ref); return }
    const refs = this.selectedRefs()
    const exists = refs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId)
    const next = exists ? refs.filter((item) => item.trackId !== ref.trackId || item.clipId !== ref.clipId) : [...refs, ref]
    this.select(next.length === 0 ? null : next.length === 1 ? next[0]! : { clips: next })
  }
  selectedRefs() {
    return visualSelectionRefs(this.state.selection)
  }
  clearError() { this.set({ error: "" }) }
  reportError(message: string) { this.set({ error: message }) }

  currentClip(ref = this.state.selection) {
    if (!ref) return null
    if ("clips" in ref) ref = ref.clips[0] || null
    if (!ref) return null
    return this.state.document.tracks.find((track) => track.id === ref.trackId)?.clips.find((clip) => clip.id === ref.clipId) || null
  }

  beginGesture() { if (!this.draft) this.draft = cloneDocument(this.state.document) }
  cancelGesture() {
    if (!this.draft) return
    this.draft = null
    this.set({ document: this.state.scene.document })
  }
  async commitGesture() {
    if (!this.draft) return
    const document = this.state.document
    const previous = this.draft
    this.draft = null
    await this.commit(document, previous)
  }

  previewClip(ref: VisualClipRef, changes: Partial<VisualSceneClip>) {
    const document = cloneDocument(this.state.document)
    const clip = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (!clip) return
    Object.assign(clip, changes)
    this.set({ document })
  }

  private normalizeClip(clip: VisualSceneClip, sourceDurationMs = 0) {
    clip.start_ms = Math.max(0, Math.round(clip.start_ms))
    const sourceRemaining = sourceDurationMs > 0
      ? Math.max(MIN_CLIP_MS, sourceDurationMs - clip.source_offset_ms)
      : Number.POSITIVE_INFINITY
    clip.duration_ms = Math.min(sourceRemaining, Math.max(MIN_CLIP_MS, Math.round(clip.duration_ms)))
    clip.source_offset_ms = Math.max(0, Math.round(clip.source_offset_ms))
    clip.position_x = Number.isFinite(clip.position_x) ? clip.position_x : 0
    clip.position_y = Number.isFinite(clip.position_y) ? clip.position_y : 0
    clip.scale = Math.min(10, Math.max(.05, Number.isFinite(clip.scale) ? clip.scale : 1))
    clip.rotation_degrees = Math.min(180, Math.max(-180, Number.isFinite(clip.rotation_degrees) ? clip.rotation_degrees : 0))
    clip.flip_horizontal = Boolean(clip.flip_horizontal)
    clip.flip_vertical = Boolean(clip.flip_vertical)
    clip.opacity = Math.min(1, Math.max(0, Number.isFinite(clip.opacity) ? clip.opacity : 1))
  }

  moveClip(ref: VisualClipRef, startMs: number) {
    const clip = this.currentClip(ref)
    if (!clip || clip.locked || this.track(ref.trackId)?.locked) return
    const selected = this.selectedRefs()
    const moving = selected.length > 1 && selected.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId)
      ? selected
      : [ref]
    const delta = Math.round(startMs) - clip.start_ms
    const document = cloneDocument(this.state.document)
    for (const item of moving) {
      const track = document.tracks.find((candidate) => candidate.id === item.trackId)
      const changed = track?.clips.find((candidate) => candidate.id === item.clipId)
      if (!changed || changed.locked || track?.locked) continue
      changed.start_ms += delta
      this.normalizeClip(changed)
    }
    this.set({ document })
  }

  trimClip(ref: VisualClipRef, edge: "start" | "end", valueMs: number, asset?: VentureAsset) {
    const clip = this.currentClip(ref)
    if (!clip || clip.locked || this.track(ref.trackId)?.locked) return
    const end = clip.start_ms + clip.duration_ms
    const sourceDurationMs = asset?.media_type === "video" ? Number(asset.duration_ms || 0) : 0
    const desiredStart = Math.min(end - MIN_CLIP_MS, Math.max(0, valueMs))
    const start = asset?.media_type === "video"
      ? Math.max(clip.start_ms - clip.source_offset_ms, desiredStart)
      : desiredStart
    const changes = edge === "start"
      ? {
        start_ms: start,
        duration_ms: end - start,
        source_offset_ms: asset?.media_type === "video"
          ? clip.source_offset_ms + start - clip.start_ms
          : 0,
      }
      : { duration_ms: Math.max(MIN_CLIP_MS, valueMs - clip.start_ms) }
    this.previewClip(ref, changes)
    const document = cloneDocument(this.state.document)
    const changed = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (changed) this.normalizeClip(changed, sourceDurationMs)
    this.set({ document })
  }

  async addTrack(mediaType: "image" | "video") {
    const document = cloneDocument(this.state.document)
    document.tracks.push({ id: uuid(), name: this.nextTrackName(mediaType, document), media_type: mediaType, visible: true, locked: false, clips: [] })
    await this.commit(document)
  }

  async addVisual(asset: VentureAsset, startMs: number, trackId?: string) {
    if (asset.media_type !== "image" && asset.media_type !== "video")
      throw new Error("Timeline visuals require an image or video Asset.")
    const sourceDurationMs = asset.media_type === "video" ? Number(asset.duration_ms || 0) : 0
    if (asset.media_type === "video" && sourceDurationMs < MIN_CLIP_MS)
      throw new Error("That video has no usable duration.")
    const document = cloneDocument(this.state.document)
    let track = trackId
      ? document.tracks.find((item) => item.id === trackId)
      : document.tracks.find((item) => item.media_type === asset.media_type)
    if (track && track.media_type !== asset.media_type)
      throw new Error(`Choose a ${asset.media_type === "video" ? "Video" : "Image"} track for this Asset.`)
    if (!track) {
      track = { id: uuid(), name: this.nextTrackName(asset.media_type, document), media_type: asset.media_type, visible: true, locked: false, clips: [] }
      document.tracks.push(track)
    }
    const durationMs = asset.media_type === "video" ? sourceDurationMs : DEFAULT_IMAGE_MS
    const clip: VisualSceneClip = { id: uuid(), asset_id: asset.id, start_ms: Math.max(0, Math.round(startMs)), duration_ms: durationMs, source_offset_ms: 0, fit: "cover", position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }
    this.normalizeClip(clip, sourceDurationMs)
    track.clips.push(clip)
    this.set({ selection: { trackId: track.id, clipId: clip.id } })
    await this.commit(document)
  }

  async addImage(asset: VentureAsset, startMs: number, trackId?: string) {
    await this.addVisual(asset, startMs, trackId)
  }

  canSplitVideo(ref: VisualClipRef, playheadMs: number, asset?: VentureAsset) {
    const clip = this.currentClip(ref)
    if (!clip || asset?.media_type !== "video" || clip.locked || this.track(ref.trackId)?.locked) return false
    const local = Math.round(playheadMs) - clip.start_ms
    return local >= MIN_CLIP_MS && local <= clip.duration_ms - MIN_CLIP_MS
  }

  async splitVideo(ref: VisualClipRef, playheadMs: number, asset?: VentureAsset) {
    if (!this.canSplitVideo(ref, playheadMs, asset)) {
      this.reportError("Place the playhead inside an unlocked video, at least 0.1 seconds from either edge.")
      return
    }
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((item) => item.id === ref.trackId)
    const index = track?.clips.findIndex((clip) => clip.id === ref.clipId) ?? -1
    const source = index >= 0 ? track?.clips[index] : undefined
    if (!track || !source) return
    const localMs = Math.round(playheadMs) - source.start_ms
    const tail: VisualSceneClip = {
      ...source,
      id: uuid(),
      start_ms: source.start_ms + localMs,
      duration_ms: source.duration_ms - localMs,
      source_offset_ms: source.source_offset_ms + localMs,
    }
    source.duration_ms = localMs
    track.clips.splice(index + 1, 0, tail)
    this.set({ selection: { trackId: track.id, clipId: tail.id } })
    await this.commit(document)
  }

  async duplicate(ref: VisualClipRef) {
    const refs = this.selectedRefs()
    await this.duplicateClips(refs.length > 1 && refs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId) ? refs : [ref])
  }

  async duplicateClips(refs = this.selectedRefs()) {
    if (!refs.length) return
    const document = cloneDocument(this.state.document)
    const copies: VisualClipRef[] = []
    for (const ref of refs) {
      const track = document.tracks.find((item) => item.id === ref.trackId)
      const source = track?.clips.find((clip) => clip.id === ref.clipId)
      if (!track || !source) continue
      const copy = { ...source, id: uuid(), start_ms: source.start_ms + 250, locked: false }
      this.normalizeClip(copy)
      track.clips.push(copy)
      copies.push({ trackId: track.id, clipId: copy.id })
    }
    if (!copies.length) return
    this.set({ selection: copies.length === 1 ? copies[0]! : { clips: copies } })
    await this.commit(document)
  }

  async nudge(ref: VisualClipRef, deltaMs: number) {
    const refs = this.selectedRefs()
    await this.nudgeClips(refs.length > 1 && refs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId) ? refs : [ref], deltaMs)
  }

  async nudgeClips(refs: VisualClipRef[], deltaMs: number) {
    if (!refs.length) return
    const document = cloneDocument(this.state.document)
    for (const ref of refs) {
      const track = document.tracks.find((candidate) => candidate.id === ref.trackId)
      const changed = track?.clips.find((item) => item.id === ref.clipId)
      if (!changed || changed.locked || track?.locked) continue
      changed.start_ms += deltaMs
      this.normalizeClip(changed)
    }
    await this.commit(document)
  }

  async removeClip(ref: VisualClipRef) {
    const refs = this.selectedRefs()
    await this.removeClips(refs.length > 1 && refs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId) ? refs : [ref])
  }

  async removeClips(refs = this.selectedRefs()) {
    if (!refs.length) return
    const document = cloneDocument(this.state.document)
    const byTrack = new Map<string, Set<string>>()
    for (const ref of refs) {
      if (!byTrack.has(ref.trackId)) byTrack.set(ref.trackId, new Set())
      byTrack.get(ref.trackId)!.add(ref.clipId)
    }
    document.tracks.forEach((track) => {
      const ids = byTrack.get(track.id)
      if (ids && !track.locked) track.clips = track.clips.filter((clip) => !ids.has(clip.id) || clip.locked)
    })
    this.set({ selection: null })
    await this.commit(document)
  }

  async setClipLocked(ref: VisualClipRef, locked: boolean) { await this.changeClip(ref, { locked }) }
  async setClipsLocked(refs: VisualClipRef[], locked: boolean) {
    if (!refs.length) return
    const document = cloneDocument(this.state.document)
    for (const ref of refs) {
      const track = document.tracks.find((candidate) => candidate.id === ref.trackId)
      const clip = track?.clips.find((item) => item.id === ref.clipId)
      if (clip && !track?.locked) clip.locked = locked
    }
    await this.commit(document)
  }
  async frameClip(ref: VisualClipRef, fit: "cover" | "contain") {
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((candidate) => candidate.id === ref.trackId)
    const clip = track?.clips.find((item) => item.id === ref.clipId)
    if (!clip || clip.locked || track?.locked) return
    Object.assign(clip, { fit, position_x: 0, position_y: 0, scale: 1 })
    await this.commit(document)
  }
  async setClipTransform(ref: VisualClipRef, changes: Pick<Partial<VisualSceneClip>, "position_x" | "position_y" | "scale" | "rotation_degrees" | "flip_horizontal" | "flip_vertical" | "opacity">) {
    const document = cloneDocument(this.state.document)
    const clip = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (!clip || clip.locked || document.tracks.find((track) => track.id === ref.trackId)?.locked) return
    Object.assign(clip, changes)
    this.normalizeClip(clip)
    await this.commit(document)
  }
  previewClipTransform(ref: VisualClipRef, changes: Pick<Partial<VisualSceneClip>, "position_x" | "position_y" | "scale" | "rotation_degrees" | "flip_horizontal" | "flip_vertical" | "opacity">) {
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((candidate) => candidate.id === ref.trackId)
    const clip = track?.clips.find((item) => item.id === ref.clipId)
    if (!clip || clip.locked || track?.locked) return
    Object.assign(clip, changes)
    this.normalizeClip(clip)
    this.set({ document })
  }
  async resetClipTransform(ref: VisualClipRef) {
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((candidate) => candidate.id === ref.trackId)
    const clip = track?.clips.find((item) => item.id === ref.clipId)
    if (!clip || clip.locked || track?.locked) return
    Object.assign(clip, {
      fit: "cover" as const,
      position_x: 0,
      position_y: 0,
      scale: 1,
      rotation_degrees: 0,
      flip_horizontal: false,
      flip_vertical: false,
    })
    await this.commit(document)
  }
  async setCanvas(width: number, height: number) {
    const document = cloneDocument(this.state.document)
    document.canvas = { width: Math.round(width), height: Math.round(height) }
    await this.commit(document)
  }
  async setTrackVisible(trackId: string, visible: boolean) { await this.changeTrack(trackId, { visible }) }
  async setTrackLocked(trackId: string, locked: boolean) { await this.changeTrack(trackId, { locked }) }
  async renameTrack(trackId: string, name: string) { await this.changeTrack(trackId, { name: name.trim() || "Visual" }) }

  async removeTrack(trackId: string) {
    const document = cloneDocument(this.state.document)
    document.tracks = document.tracks.filter((track) => track.id !== trackId)
    if (this.selectedRefs().some((ref) => ref.trackId === trackId)) this.set({ selection: null })
    await this.commit(document)
  }

  async moveTrack(trackId: string, direction: -1 | 1) {
    const document = cloneDocument(this.state.document)
    const index = document.tracks.findIndex((track) => track.id === trackId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= document.tracks.length) return
    const [track] = document.tracks.splice(index, 1)
    if (track) document.tracks.splice(target, 0, track)
    await this.commit(document)
  }

  private track(id: string) { return this.state.document.tracks.find((track) => track.id === id) }
  private nextTrackName(mediaType: "image" | "video", document = this.state.document) {
    const base = mediaType === "video" ? "Video" : "Image"
    const names = new Set(document.tracks.filter((track) => track.media_type === mediaType).map((track) => track.name.trim()))
    let index = 1
    while (names.has(`${base} ${index}`)) index += 1
    return `${base} ${index}`
  }
  private async changeTrack(trackId: string, changes: Partial<VisualSceneTrack>) {
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((item) => item.id === trackId)
    if (!track) return
    Object.assign(track, changes)
    await this.commit(document)
  }
  private async changeClip(ref: VisualClipRef, changes: Partial<VisualSceneClip>) {
    const document = cloneDocument(this.state.document)
    const clip = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (!clip) return
    Object.assign(clip, changes)
    await this.commit(document)
  }

  async undo() {
    const target = this.undoStack.pop()
    if (!target) return
    const current = cloneDocument(this.state.document)
    this.redoStack.push(current)
    try {
      await this.commit(target, current, false)
    } catch (reason) {
      this.redoStack.pop()
      this.undoStack.push(target)
      this.set({ canUndo: true, canRedo: this.redoStack.length > 0 })
      throw reason
    }
  }

  async redo() {
    const target = this.redoStack.pop()
    if (!target) return
    const current = cloneDocument(this.state.document)
    this.undoStack.push(current)
    try {
      await this.commit(target, current, false)
    } catch (reason) {
      this.undoStack.pop()
      this.redoStack.push(target)
      this.set({ canUndo: this.undoStack.length > 0, canRedo: true })
      throw reason
    }
  }

  async commit(document = this.state.document, previous = this.state.document, recordHistory = true) {
    const next = cloneDocument(document)
    const before = cloneDocument(previous)
    this.set({ document: next, saving: true, error: "" })
    const promise = new Promise<void>((resolve, reject) => {
      this.pending.push({ document: next, previous: before, recordHistory, resolve, reject })
    })
    if (!this.drain) this.drain = this.flush()
    await promise
  }

  private async flush() {
    while (this.pending.length) {
      const item = this.pending.shift()!
      try {
        const scene = await this.persistence.update(item.document, this.state.scene.revision)
        if (item.recordHistory) {
          this.undoStack.push(item.previous)
          this.redoStack = []
        }
        this.set({
          scene,
          document: this.pending.at(-1)?.document || scene.document,
          canUndo: this.undoStack.length > 0,
          canRedo: this.redoStack.length > 0,
        })
        item.resolve()
      } catch (reason) {
        item.reject(reason)
        this.pending.splice(0).forEach((pending) => pending.reject(reason))
        this.set({ document: this.state.scene.document, error: reason instanceof Error ? reason.message : "The visual Timeline could not be saved." })
      }
    }
    this.drain = null
    this.set({ saving: false })
  }
}

const EMPTY_SCENE: VisualScene = { production_id: 0, revision: 0, document: { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [] }, updated_at: "" }
const EMPTY_SNAPSHOT: Snapshot = { scene: EMPTY_SCENE, document: EMPTY_SCENE.document, selection: null, saving: false, error: "", canUndo: false, canRedo: false }
const noopSubscribe = () => () => undefined
const emptySnapshot = () => EMPTY_SNAPSHOT

export function useVisualSceneSession(session: VisualSceneSession | null | undefined) {
  return useSyncExternalStore(session?.subscribe || noopSubscribe, session?.snapshot || emptySnapshot, session?.snapshot || emptySnapshot)
}
