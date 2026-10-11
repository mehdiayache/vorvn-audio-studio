import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

type Layout = { workbenchHeight: number; browserCollapsed: boolean }
type LayoutState = Layout & { storageKey: string }
type ResizeGesture = { y: number; height: number; pointerId: number; target: HTMLButtonElement; storageKey: string }

function readLayout(storageKey: string, defaultHeight: number, min: number, max: number): Layout {
  try {
    const raw: unknown = typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(storageKey) || "null")
    const value = raw && typeof raw === "object" ? raw as Partial<Layout> : {}
    return {
      workbenchHeight: Number.isFinite(value.workbenchHeight) ? Math.max(min, Math.min(max, value.workbenchHeight!)) : defaultHeight,
      browserCollapsed: value.browserCollapsed === true,
    }
  } catch { return { workbenchHeight: defaultHeight, browserCollapsed: false } }
}

function release(gesture: ResizeGesture | null) {
  if (!gesture) return
  try { gesture.target.releasePointerCapture?.(gesture.pointerId) } catch { /* Capture may already have ended. */ }
}

/** Actual Studio layout preference/resize owner. Storage identity is supplied by the host. */
export function useStudioWorkstationLayout({ storageKey, defaultHeight = 360, minHeight = 220, maxHeight = 620, reservedHeight = 230 }: {
  storageKey: string; defaultHeight?: number; minHeight?: number; maxHeight?: number; reservedHeight?: number
}) {
  const min = Number.isFinite(minHeight) && minHeight > 0 ? minHeight : 220
  const max = Number.isFinite(maxHeight) && maxHeight >= min ? maxHeight : Math.max(min, 620)
  const initialHeight = Math.max(min, Math.min(max, Number.isFinite(defaultHeight) ? defaultHeight : 360))
  const reserved = Number.isFinite(reservedHeight) && reservedHeight >= 0 ? reservedHeight : 230
  const [state, setState] = useState<LayoutState>(() => ({ storageKey, ...readLayout(storageKey, initialHeight, min, max) }))
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const resize = useRef<ResizeGesture | null>(null)
  const current = state.storageKey === storageKey ? state : { storageKey, ...readLayout(storageKey, initialHeight, min, max) }
  const currentRef = useRef(current)
  currentRef.current = current

  const bound = useCallback((height: number, element: HTMLElement | null = container) => {
    // A short workspace still leaves the editing lanes usable below the monitor.
    const available = element?.clientHeight ? Math.max(80, element.clientHeight - reserved) : max
    return Math.max(Math.min(min, available), Math.min(max, available, Number.isFinite(height) ? height : initialHeight))
  }, [container, initialHeight, max, min, reserved])
  const setWorkbenchHeight = useCallback((height: number) => {
    setState({ ...currentRef.current, storageKey, workbenchHeight: bound(height) })
  }, [bound, storageKey])
  const setBrowserCollapsed = useCallback((browserCollapsed: boolean) => {
    setState({ ...currentRef.current, storageKey, browserCollapsed })
  }, [storageKey])

  useEffect(() => {
    if (state.storageKey !== storageKey) {
      release(resize.current)
      resize.current = null
      setState({ storageKey, ...readLayout(storageKey, initialHeight, min, max) })
      return
    }
    // Pointer drafts are persisted only when accepted, never during a gesture.
    if (resize.current) return
    try { window.localStorage.setItem(storageKey, JSON.stringify({ workbenchHeight: Math.round(state.workbenchHeight), browserCollapsed: state.browserCollapsed })) } catch { /* Device layout preference is optional. */ }
  }, [initialHeight, max, min, state, storageKey])

  const cancel = useCallback(() => {
    const gesture = resize.current
    if (!gesture) return
    resize.current = null
    release(gesture)
    if (gesture.storageKey === storageKey) setState({ ...currentRef.current, workbenchHeight: bound(gesture.height, container || gesture.target.parentElement) })
  }, [bound, container, storageKey])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !resize.current) return
      event.preventDefault()
      cancel()
    }
    window.addEventListener("keydown", keydown)
    window.addEventListener("blur", cancel)
    return () => {
      window.removeEventListener("keydown", keydown)
      window.removeEventListener("blur", cancel)
      release(resize.current)
      resize.current = null
    }
  }, [cancel])

  useEffect(() => {
    if (!container) return
    const clamp = () => {
      const value = currentRef.current
      const height = bound(value.workbenchHeight, container)
      if (height !== value.workbenchHeight) setState({ ...value, workbenchHeight: height })
    }
    clamp()
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", clamp)
      return () => window.removeEventListener("resize", clamp)
    }
    const observer = new ResizeObserver(clamp)
    observer.observe(container)
    return () => observer.disconnect()
  }, [bound, container, storageKey])

  const move = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = resize.current
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.storageKey !== storageKey) return
    setState({ ...currentRef.current, workbenchHeight: bound(gesture.height + event.clientY - gesture.y, container || event.currentTarget.parentElement) })
  }, [bound, container, storageKey])
  const begin = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || resize.current || !Number.isFinite(event.clientY)) return
    event.preventDefault()
    resize.current = { y: event.clientY, height: currentRef.current.workbenchHeight, pointerId: event.pointerId, target: event.currentTarget, storageKey }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [storageKey])
  const end = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = resize.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    move(event)
    resize.current = null
    release(gesture)
    // Ensure a pointer-up with unchanged coordinates also commits the preference.
    setState(value => ({ ...value }))
  }, [move])

  return { workbenchHeight: current.workbenchHeight, setWorkbenchHeight, browserCollapsed: current.browserCollapsed, setBrowserCollapsed, containerRef: setContainer, begin, move, end, cancel }
}
