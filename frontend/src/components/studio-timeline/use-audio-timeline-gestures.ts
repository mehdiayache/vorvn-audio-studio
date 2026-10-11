import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"

/** Actual Studio gesture controller. Persistence and media remain host-owned. */
export type SoundClipRef = { trackId: string; clipId: string }
export type AudioGestureClip = { gain: number; locked: boolean; fade_in_ms: number; fade_out_ms: number; resolved_duration_ms?: number; duration_ms?: number | null }
export interface AudioTimelineSessionPort {
  selectClip(trackId: string, clipId: string, toggle?: boolean): void
  selectedClips(): SoundClipRef[]
  currentClip(trackId: string, clipId: string): AudioGestureClip | null
  canMoveClips(refs: SoundClipRef[]): boolean
  beginGesture(): void
  moveClips(refs: SoundClipRef[], deltaSamples: number): unknown
  trimClip(trackId: string, clipId: string, edge: "left" | "right", deltaSamples: number): number | void
  updateClip(trackId: string, clipId: string, changes: Partial<AudioGestureClip>): void
  commitGesture(): Promise<unknown> | void
  cancelGesture(): void
  reportError(message: string): void
}
export type TimelineGestureEngine = { tracks: readonly { id: string; clips: readonly { id: string; startSample: number; durationSamples: number }[] }[] }

export type AudioGestureMode = "move" | "left" | "right" | "gain" | "fade-in" | "fade-out"

export function useAudioTimelineGestures({ session, visualSession, engine, selectedRefs, saving, pixelsPerSecond, snap, snapPlacement, clearSnapGuide, activeCancel, active = true, editable = true, sampleRate = 48_000, revisionKey }: {
  session: AudioTimelineSessionPort
  visualSession?: { select(selection: null): void }
  engine: TimelineGestureEngine
  selectedRefs: SoundClipRef[]
  saving: boolean
  pixelsPerSecond: number
  snap: (value: number, bypass: boolean) => number
  snapPlacement?: (start: number, duration: number, bypass: boolean) => number
  clearSnapGuide: () => void
  activeCancel: { current: (() => void) | null }
  active?: boolean
  editable?: boolean
  sampleRate?: number
  revisionKey?: unknown
}) {
  const ownCancel = useRef<(() => void) | null>(null)
  useEffect(() => () => ownCancel.current?.(), [active, editable, saving, revisionKey])
  return useCallback((event: ReactPointerEvent, trackId: string, clipId: string, mode: AudioGestureMode) => {
    if (event.button !== 0 || saving || !active || !editable) return
    activeCancel.current?.()
    event.stopPropagation()
    visualSession?.select(null)
    const grabbedWasSelected = selectedRefs.some((ref) => ref.trackId === trackId && ref.clipId === clipId)
    const preserveGroup = mode === "move" && grabbedWasSelected && selectedRefs.length > 1
    if (!preserveGroup) session.selectClip(trackId, clipId, event.shiftKey || event.metaKey || event.ctrlKey)
    const movingRefs = mode === "move"
      ? (preserveGroup ? selectedRefs : session.selectedClips())
      : [{ trackId, clipId }]
    const engineTrack = engine.tracks.find((track) => track.id === trackId)
    const initial = engineTrack?.clips.find((clip) => clip.id === clipId)
    const persisted = session.currentClip(trackId, clipId)
    if (!initial || !persisted) return
    if (mode === "move" && !session.canMoveClips(movingRefs)) return
    if (persisted.locked && ["left", "right"].includes(mode)) {
      session.reportError("Unlock this clip before trimming it.")
      return
    }
    const movingIds = new Set(movingRefs.map(ref => `${ref.trackId}:${ref.clipId}`))
    const movingStarts = engine.tracks.flatMap(track => track.clips.filter(clip => movingIds.has(`${track.id}:${clip.id}`)).map(clip => clip.startSample))
    const earliestStart = movingStarts.length ? Math.min(...movingStarts) : initial.startSample
    const pointerId = event.pointerId
    const originX = event.clientX
    const originY = event.clientY
    let started = false
    let appliedSamples = 0
    let finished = false
    const begin = () => {
      if (started) return
      started = true
      session.beginGesture()
    }
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const dx = next.clientX - originX
      const dy = next.clientY - originY
      if (!started && Math.hypot(dx, dy) < 4) return
      begin()
      if (mode === "gain") {
        const initialDb = persisted.gain <= .001 ? -60 : 20 * Math.log10(persisted.gain)
        const gain = Math.min(2, Math.max(0, 10 ** (Math.max(-60, Math.min(6, initialDb - dy * .25)) / 20)))
        session.updateClip(trackId, clipId, { gain })
        return
      }
      if (mode === "fade-in" || mode === "fade-out") {
        const durationMs = Number(persisted.resolved_duration_ms || persisted.duration_ms || 0)
        const original = mode === "fade-in" ? persisted.fade_in_ms : persisted.fade_out_ms
        const milliseconds = Math.max(0, Math.min(
          durationMs,
          original + (mode === "fade-in" ? dx : -dx) / pixelsPerSecond * 1000,
        ))
        session.updateClip(trackId, clipId, {
          [mode === "fade-in" ? "fade_in_ms" : "fade_out_ms"]: Math.round(milliseconds),
        })
        return
      }
      const originalStart = initial.startSample / sampleRate
      const originalEnd = (initial.startSample + initial.durationSamples) / sampleRate
      let seconds = dx / pixelsPerSecond
      if (mode === "move") seconds = (snapPlacement ? snapPlacement(originalStart + seconds, initial.durationSamples / sampleRate, next.altKey) : snap(originalStart + seconds, next.altKey)) - originalStart
      if (mode === "left") seconds = snap(originalStart + seconds, next.altKey) - originalStart
      if (mode === "right") seconds = snap(originalEnd + seconds, next.altKey) - originalEnd
      // Clamp the cumulative pointer target, not only each engine increment.
      // Otherwise reversing after dragging past zero moves the group too far.
      const targetSamples = mode === "move" ? Math.max(-earliestStart, Math.round(seconds * sampleRate)) : Math.round(seconds * sampleRate)
      const deltaSamples = targetSamples - appliedSamples
      if (mode === "move") { session.moveClips(movingRefs, deltaSamples); appliedSamples = targetSamples }
      else {
        const applied = session.trimClip(trackId, clipId, mode, deltaSamples)
        appliedSamples = typeof applied === "number" && Number.isFinite(applied) ? appliedSamples + applied : targetSamples
      }
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", escape, true)
      if (activeCancel.current === cancel) activeCancel.current = null
      ownCancel.current = null
      clearSnapGuide()
    }
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      if (finished) return
      finished = true
      cleanup()
      if (started) Promise.resolve(session.commitGesture()).catch((reason) => session.reportError(reason instanceof Error ? reason.message : "The gesture could not be saved."))
    }
    const cancel = () => {
      if (finished) return
      finished = true
      cleanup()
      if (started) session.cancelGesture()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"],[role="alertdialog"]'))) return
      event.preventDefault(); event.stopPropagation(); cancel()
    }
    ownCancel.current = cancel
    activeCancel.current = cancel
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", cancel, { once: true })
    window.addEventListener("blur", cancel, { once: true })
    window.addEventListener("keydown", escape, true)
  }, [active, editable, sampleRate, activeCancel, clearSnapGuide, engine.tracks, pixelsPerSecond, saving, selectedRefs, session, snap, snapPlacement, visualSession])
}
