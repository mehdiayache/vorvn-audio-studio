import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"

export type StudioPreviewRef = { trackId: string; clipId: string }
export type StudioPreviewPosition = { positionX: number; positionY: number }

/** The actual VisualSceneMonitor drag, expressed as canvas-normalized positions.
 * The host owns drafts, history, persistence, authorization and media identity. */
export function useStudioPreviewGestures<Transform extends StudioPreviewPosition>({ selection, active = true, editable = true, onBegin, onPreview, onCommit, onCancel, onError, positionBounds, revisionKey }: {
  selection: StudioPreviewRef | null
  active?: boolean
  editable?: boolean
  onBegin?: () => void
  onPreview: (ref: StudioPreviewRef, transform: Transform) => void
  onCommit: (ref: StudioPreviewRef, transform: Transform) => Promise<unknown> | void
  onCancel: () => void
  onError?: (error: unknown) => void
  positionBounds?: { min: number; max: number }
  revisionKey?: unknown
}) {
  const cancelActive = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelActive.current?.(), [active, editable, selection?.trackId, selection?.clipId, revisionKey])
  return useCallback((event: ReactPointerEvent, ref: StudioPreviewRef, transform: Transform, frame: HTMLElement | null, locked = false) => {
    if (!active || !editable || locked || event.button !== 0 || !selection || selection.trackId !== ref.trackId || selection.clipId !== ref.clipId || !frame) return
    const rect = frame.getBoundingClientRect()
    if (!(rect.width > 0 && rect.height > 0)) return
    cancelActive.current?.()
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId, startX = event.clientX, startY = event.clientY
    let started = false, finished = false, latest = transform
    const bound = (value: number) => positionBounds ? Math.max(positionBounds.min, Math.min(positionBounds.max, value)) : value
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      if (!started && Math.hypot(next.clientX - startX, next.clientY - startY) < 3) return
      try {
        if (!started) { started = true; onBegin?.() }
        latest = { ...transform, positionX: bound(transform.positionX + (next.clientX - startX) / rect.width), positionY: bound(transform.positionY + (next.clientY - startY) / rect.height) }
        onPreview(ref, latest)
      } catch (error) { cancel(); onError?.(error) }
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", pointerCancel)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", escape, true)
      if (cancelActive.current === cancel) cancelActive.current = null
    }
    const finish = (next: PointerEvent) => {
      if (finished || next.pointerId !== pointerId) return
      finished = true; cleanup()
      if (!started) return
      try { Promise.resolve(onCommit(ref, latest)).catch(error => onError?.(error)) }
      catch (error) { onError?.(error) }
    }
    const cancel = () => {
      if (finished) return
      finished = true; cleanup()
      if (started) onCancel()
    }
    const pointerCancel = (next: PointerEvent) => { if (next.pointerId === pointerId) cancel() }
    const escape = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); next.stopPropagation(); cancel() } }
    cancelActive.current = cancel
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", pointerCancel)
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", escape, true)
  }, [active, editable, onBegin, onCancel, onCommit, onError, onPreview, positionBounds, selection])
}
