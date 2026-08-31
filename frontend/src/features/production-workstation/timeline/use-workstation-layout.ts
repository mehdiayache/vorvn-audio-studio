import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

const STORAGE_KEY = "auvi.timeline.workstation-layout.v1"
const DEFAULT_HEIGHT = 360
const MIN_HEIGHT = 220
const MAX_HEIGHT = 620

function storedLayout() {
  if (typeof window === "undefined") return { workbenchHeight: DEFAULT_HEIGHT, browserCollapsed: false }
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as { workbenchHeight?: number; browserCollapsed?: boolean }
    return {
      workbenchHeight: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Number(value.workbenchHeight) || DEFAULT_HEIGHT)),
      browserCollapsed: Boolean(value.browserCollapsed),
    }
  } catch {
    return { workbenchHeight: DEFAULT_HEIGHT, browserCollapsed: false }
  }
}

export function useWorkstationLayout() {
  const initial = useRef(storedLayout())
  const [workbenchHeight, setWorkbenchHeight] = useState(initial.current.workbenchHeight)
  const [browserCollapsed, setBrowserCollapsed] = useState(initial.current.browserCollapsed)
  const resize = useRef<{ y: number; height: number } | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ workbenchHeight: Math.round(workbenchHeight), browserCollapsed })) } catch { /* optional preference */ }
  }, [browserCollapsed, workbenchHeight])

  const move = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = resize.current
    if (!active) return
    const available = Math.max(MIN_HEIGHT, (event.currentTarget.parentElement?.clientHeight || MAX_HEIGHT + 300) - 230)
    setWorkbenchHeight(Math.min(MAX_HEIGHT, available, Math.max(MIN_HEIGHT, active.height + event.clientY - active.y)))
  }, [])
  const begin = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    resize.current = { y: event.clientY, height: workbenchHeight }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [workbenchHeight])
  const end = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resize.current) return
    move(event)
    resize.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [move])

  return { workbenchHeight, setWorkbenchHeight, browserCollapsed, setBrowserCollapsed, begin, move, end }
}
