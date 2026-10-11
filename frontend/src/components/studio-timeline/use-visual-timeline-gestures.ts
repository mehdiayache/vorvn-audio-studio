import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"

export type VisualClipRef = { trackId: string; clipId: string }
export type VisualGestureClip = { file_id: string | number; start_ms: number; duration_ms: number; locked: boolean }
export interface VisualTimelineSessionPort<File> {
  currentClip(ref: VisualClipRef): VisualGestureClip | null
  selectClip(ref: VisualClipRef, toggle?: boolean): void
  beginGesture(): void
  cancelGesture(): void
  commitGesture(): Promise<unknown> | void
  moveClip(ref: VisualClipRef, startMs: number): void
  trimClip(ref: VisualClipRef, edge: "start" | "end", timeMs: number, file?: File): void
  reportError(message: string): void
}

export function useVisualTimelineGestures<File extends { id: string | number }>({ session, visualSession, files, visualTracks, selectedRefs, saving, pixelsPerSecond, snap, snapPlacement, clearSnapGuide, activeCancel, active = true, editable = true, revisionKey }: {
  session: { select(selection: null): void }
  visualSession?: VisualTimelineSessionPort<File>
  files: readonly File[]
  visualTracks: readonly { id: string; locked: boolean }[]
  selectedRefs: VisualClipRef[]
  saving: boolean
  pixelsPerSecond: number
  snap: (value: number, bypass: boolean) => number
  snapPlacement?: (start: number, duration: number, bypass: boolean) => number
  clearSnapGuide: () => void
  activeCancel: { current: (() => void) | null }
  active?: boolean
  editable?: boolean
  revisionKey?: unknown
}) {
  const ownCancel = useRef<(() => void) | null>(null)
  useEffect(() => () => ownCancel.current?.(), [active, editable, saving, revisionKey])
  return useCallback((event: ReactPointerEvent, ref: VisualClipRef, mode: "move" | "start" | "end") => {
    if (!active || !editable || event.button !== 0 || saving) return
    activeCancel.current?.()
    const initial = visualSession?.currentClip(ref)
    if (!visualSession || !initial) return
    event.preventDefault()
    event.stopPropagation()
    const grabbedWasSelected = selectedRefs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId)
    if (!(mode === "move" && grabbedWasSelected && selectedRefs.length > 1)) {
      visualSession.selectClip(ref, event.shiftKey || event.metaKey || event.ctrlKey)
    }
    session.select(null)
    if (initial.locked || visualTracks.find((track) => track.id === ref.trackId)?.locked) {
      visualSession.reportError("Unlock this visual before changing its timing.")
      return
    }
    const movingRefs = mode === "move" && grabbedWasSelected && selectedRefs.length > 1 ? selectedRefs : [ref]
    const movingClips = movingRefs.flatMap(item => { const clip = visualSession.currentClip(item); return clip ? [{ ref: item, clip }] : [] })
    if (mode === "move" && movingClips.some(item => item.clip.locked || visualTracks.find(track => track.id === item.ref.trackId)?.locked)) {
      visualSession.reportError("Unlock every selected visual before moving the group.")
      return
    }
    const earliestStart = Math.min(initial.start_ms, ...movingClips.map(item => item.clip.start_ms))
    const pointerId = event.pointerId
    const originX = event.clientX
    const originalStart = initial.start_ms
    const originalEnd = initial.start_ms + initial.duration_ms
    let started = false
    let finished = false
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const dx = next.clientX - originX
      if (!started && Math.abs(dx) < 4) return
      if (!started) {
        started = true
        visualSession.beginGesture()
      }
      const deltaMs = dx / pixelsPerSecond * 1000
      const file = files.find((item) => item.id === initial.file_id)
      if (mode === "move") {
        const start = originalStart / 1000 + deltaMs / 1000
        visualSession.moveClip(ref, Math.max(originalStart - earliestStart, (snapPlacement ? snapPlacement(start, initial.duration_ms / 1000, next.altKey) : snap(start, next.altKey)) * 1000))
      } else if (mode === "start") {
        visualSession.trimClip(ref, "start", snap(originalStart / 1000 + deltaMs / 1000, next.altKey) * 1000, file)
      } else {
        visualSession.trimClip(ref, "end", snap(originalEnd / 1000 + deltaMs / 1000, next.altKey) * 1000, file)
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
      if (started) Promise.resolve(visualSession.commitGesture()).catch((reason) => visualSession.reportError(reason instanceof Error ? reason.message : "The gesture could not be saved."))
    }
    const cancel = () => {
      if (finished) return
      finished = true
      cleanup()
      if (started) visualSession.cancelGesture()
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
  }, [active, editable, activeCancel, files, clearSnapGuide, pixelsPerSecond, saving, selectedRefs, session, snap, snapPlacement, visualSession, visualTracks])
}
