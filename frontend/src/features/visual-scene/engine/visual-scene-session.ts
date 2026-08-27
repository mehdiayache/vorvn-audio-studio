import { useSyncExternalStore } from "react"

import type { VentureAsset, VisualScene, VisualSceneClip, VisualSceneDocument, VisualSceneTrack } from "@/types/domain"

export type VisualClipRef = { trackId: string; clipId: string }
export type VisualSceneSelection = VisualClipRef | null

type Snapshot = {
  scene: VisualScene
  document: VisualSceneDocument
  selection: VisualSceneSelection
  saving: boolean
  error: string
}

type Persistence = {
  update: (document: VisualSceneDocument, expectedRevision: number) => Promise<VisualScene>
}

const MIN_CLIP_MS = 100
const DEFAULT_IMAGE_MS = 5_000

function cloneDocument(document: VisualSceneDocument): VisualSceneDocument {
  return { ...document, tracks: document.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) })) }
}

function uuid() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `visual-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class VisualSceneSession {
  private listeners = new Set<() => void>()
  private draft: VisualSceneDocument | null = null
  private pending: VisualSceneDocument | null = null
  private drain: Promise<void> | null = null
  private state: Snapshot

  constructor(scene: VisualScene, private readonly persistence: Persistence, private timelineDurationMs: number) {
    this.state = { scene, document: scene.document, selection: null, saving: false, error: "" }
  }

  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit() { this.listeners.forEach((listener) => listener()) }
  private set(changes: Partial<Snapshot>) { this.state = { ...this.state, ...changes }; this.emit() }

  setTimelineDuration(durationMs: number) { this.timelineDurationMs = Math.max(0, durationMs) }
  reconcile(scene: VisualScene) {
    if (this.state.saving || this.draft) return
    this.set({ scene, document: scene.document })
  }
  select(selection: VisualSceneSelection) { this.set({ selection }) }
  clearError() { this.set({ error: "" }) }
  reportError(message: string) { this.set({ error: message }) }

  currentClip(ref = this.state.selection) {
    if (!ref) return null
    return this.state.document.tracks.find((track) => track.id === ref.trackId)?.clips.find((clip) => clip.id === ref.clipId) || null
  }

  beginGesture() { this.draft = cloneDocument(this.state.document) }
  cancelGesture() {
    if (!this.draft) return
    this.draft = null
    this.set({ document: this.state.scene.document })
  }
  async commitGesture() {
    if (!this.draft) return
    const document = this.state.document
    this.draft = null
    await this.commit(document)
  }

  previewClip(ref: VisualClipRef, changes: Partial<VisualSceneClip>) {
    const document = cloneDocument(this.state.document)
    const clip = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (!clip) return
    Object.assign(clip, changes)
    this.set({ document })
  }

  private normalizeClip(clip: VisualSceneClip) {
    const maximumStart = Math.max(0, this.timelineDurationMs - MIN_CLIP_MS)
    clip.start_ms = Math.min(maximumStart, Math.max(0, Math.round(clip.start_ms)))
    const maximumDuration = Math.max(MIN_CLIP_MS, this.timelineDurationMs - clip.start_ms)
    clip.duration_ms = Math.min(maximumDuration, Math.max(MIN_CLIP_MS, Math.round(clip.duration_ms)))
    clip.source_offset_ms = Math.max(0, Math.round(clip.source_offset_ms))
  }

  moveClip(ref: VisualClipRef, startMs: number) {
    const clip = this.currentClip(ref)
    if (!clip || clip.locked || this.track(ref.trackId)?.locked) return
    this.previewClip(ref, { start_ms: startMs })
    const next = this.currentClip(ref)
    if (next) { const document = cloneDocument(this.state.document); const changed = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId); if (changed) this.normalizeClip(changed); this.set({ document }) }
  }

  trimClip(ref: VisualClipRef, edge: "start" | "end", valueMs: number) {
    const clip = this.currentClip(ref)
    if (!clip || clip.locked || this.track(ref.trackId)?.locked) return
    const end = clip.start_ms + clip.duration_ms
    const changes = edge === "start"
      ? { start_ms: Math.min(end - MIN_CLIP_MS, Math.max(0, valueMs)), duration_ms: end - Math.min(end - MIN_CLIP_MS, Math.max(0, valueMs)) }
      : { duration_ms: Math.max(MIN_CLIP_MS, valueMs - clip.start_ms) }
    this.previewClip(ref, changes)
    const document = cloneDocument(this.state.document)
    const changed = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (changed) this.normalizeClip(changed)
    this.set({ document })
  }

  async addTrack(name?: string) {
    const document = cloneDocument(this.state.document)
    document.tracks.push({ id: uuid(), name: name || `Visual ${document.tracks.length + 1}`, visible: true, locked: false, clips: [] })
    await this.commit(document)
  }

  async addImage(asset: VentureAsset, startMs: number, trackId?: string) {
    if (asset.media_type !== "image") throw new Error("Video placement belongs to the next Timeline checkpoint.")
    const document = cloneDocument(this.state.document)
    let track = trackId ? document.tracks.find((item) => item.id === trackId) : document.tracks[0]
    if (!track) {
      track = { id: uuid(), name: "Visual 1", visible: true, locked: false, clips: [] }
      document.tracks.push(track)
    }
    const available = Math.max(MIN_CLIP_MS, this.timelineDurationMs - Math.max(0, startMs))
    const clip: VisualSceneClip = { id: uuid(), asset_id: asset.id, start_ms: Math.max(0, Math.round(startMs)), duration_ms: Math.min(DEFAULT_IMAGE_MS, available), source_offset_ms: 0, locked: false }
    this.normalizeClip(clip)
    track.clips.push(clip)
    this.set({ selection: { trackId: track.id, clipId: clip.id } })
    await this.commit(document)
  }

  async duplicate(ref: VisualClipRef) {
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((item) => item.id === ref.trackId)
    const source = track?.clips.find((clip) => clip.id === ref.clipId)
    if (!track || !source) return
    const copy = { ...source, id: uuid(), start_ms: source.start_ms + 250, locked: false }
    this.normalizeClip(copy)
    track.clips.push(copy)
    this.set({ selection: { trackId: track.id, clipId: copy.id } })
    await this.commit(document)
  }

  async nudge(ref: VisualClipRef, deltaMs: number) {
    const clip = this.currentClip(ref)
    if (!clip || clip.locked || this.track(ref.trackId)?.locked) return
    const document = cloneDocument(this.state.document)
    const changed = document.tracks.find((track) => track.id === ref.trackId)?.clips.find((item) => item.id === ref.clipId)
    if (!changed) return
    changed.start_ms += deltaMs
    this.normalizeClip(changed)
    await this.commit(document)
  }

  async removeClip(ref: VisualClipRef) {
    const document = cloneDocument(this.state.document)
    const track = document.tracks.find((item) => item.id === ref.trackId)
    if (!track) return
    track.clips = track.clips.filter((clip) => clip.id !== ref.clipId)
    this.set({ selection: null })
    await this.commit(document)
  }

  async setClipLocked(ref: VisualClipRef, locked: boolean) { await this.changeClip(ref, { locked }) }
  async setTrackVisible(trackId: string, visible: boolean) { await this.changeTrack(trackId, { visible }) }
  async setTrackLocked(trackId: string, locked: boolean) { await this.changeTrack(trackId, { locked }) }
  async renameTrack(trackId: string, name: string) { await this.changeTrack(trackId, { name: name.trim() || "Visual" }) }

  async removeTrack(trackId: string) {
    const document = cloneDocument(this.state.document)
    document.tracks = document.tracks.filter((track) => track.id !== trackId)
    if (this.state.selection?.trackId === trackId) this.set({ selection: null })
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

  async commit(document = this.state.document) {
    this.pending = cloneDocument(document)
    this.set({ document: this.pending, saving: true, error: "" })
    if (!this.drain) this.drain = this.flush()
    await this.drain
  }

  private async flush() {
    try {
      while (this.pending) {
        const document = this.pending
        this.pending = null
        const scene = await this.persistence.update(document, this.state.scene.revision)
        this.set({ scene, document: this.pending || scene.document })
      }
    } catch (reason) {
      this.pending = null
      this.set({ document: this.state.scene.document, error: reason instanceof Error ? reason.message : "The visual Timeline could not be saved." })
      throw reason
    } finally {
      this.drain = null
      this.set({ saving: false })
    }
  }
}

const EMPTY_SCENE: VisualScene = { production_id: 0, revision: 0, document: { version: 1, tracks: [] }, updated_at: "" }
const EMPTY_SNAPSHOT: Snapshot = { scene: EMPTY_SCENE, document: EMPTY_SCENE.document, selection: null, saving: false, error: "" }
const noopSubscribe = () => () => undefined
const emptySnapshot = () => EMPTY_SNAPSHOT

export function useVisualSceneSession(session: VisualSceneSession | null | undefined) {
  return useSyncExternalStore(session?.subscribe || noopSubscribe, session?.snapshot || emptySnapshot, session?.snapshot || emptySnapshot)
}
