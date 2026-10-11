import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

/** Original Studio viewport interactions; host supplies its clock and zoom scale. */
export interface TimelineViewportSessionPort {
  seek(seconds: number): void
  setZoomLevel(samplesPerPixel: number): void
  snapshot(): { engine: { samplesPerPixel: number } }
}
const TICK_STEPS = [.1, .25, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400]
export function useTimelineViewport({ session, total, pixelsPerSecond, samplesPerPixel, playhead, playback, zoomLevels, sampleRate = 48_000, active = true }: {
  session: TimelineViewportSessionPort
  total: number
  pixelsPerSecond: number
  samplesPerPixel: number
  playhead: number
  playback: "idle" | "preparing" | "playing"
  zoomLevels: readonly number[]
  sampleRate?: number
  active?: boolean
}) {
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const [panning, setPanning] = useState(false)
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(920)
  const [scrollLeft, setScrollLeft] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLElement>(null)
  const activeCancel = useRef<(() => void) | null>(null)
  const frames = useRef(new Set<number>())
  const programmaticUntil = useRef(0)
  const levels = useMemo(() => [...zoomLevels].filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b), [zoomLevels])
  if (!levels.length) throw new Error("TIMELINE_ZOOM_LEVELS_REQUIRED")
  const closest = levels.reduce((best, candidate) => Math.abs(candidate - samplesPerPixel) < Math.abs(best - samplesPerPixel) ? candidate : best)
  const zoomIndex = levels.length - 1 - levels.indexOf(closest)
  const zoomLevel = useCallback((index: number) => levels[levels.length - 1 - Math.max(0, Math.min(levels.length - 1, Math.round(index)))]!, [levels])
  const width = Math.max(timelineViewportWidth, Math.ceil(total * pixelsPerSecond))
  const step = TICK_STEPS.find(value => value * pixelsPerSecond >= 70) || Math.max(86400, Math.ceil(70 / pixelsPerSecond))
  const marks = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollLeft / pixelsPerSecond / step) - 1)
    const last = Math.min(Math.floor(total / step), Math.ceil((scrollLeft + timelineViewportWidth) / pixelsPerSecond / step) + 1)
    return Array.from({ length: Math.max(0, Math.min(512, last - first + 1)) }, (_, index) => (first + index) * step)
  }, [pixelsPerSecond, scrollLeft, step, timelineViewportWidth, total])
  const scheduleFrame = useCallback((action: () => void) => {
    const id = requestAnimationFrame(() => { frames.current.delete(id); action() })
    frames.current.add(id)
  }, [])
  useEffect(() => () => {
    activeCancel.current?.()
    for (const frame of frames.current) cancelAnimationFrame(frame)
    frames.current.clear()
  }, [active])
  const programmaticScroll = useCallback((action: () => void) => { programmaticUntil.current = performance.now() + 500; action() }, [])

  const seekFromPointer = useCallback((event: ReactPointerEvent) => {
    const scroll = scrollRef.current
    if (!active || !scroll || event.button !== 0) return
    event.preventDefault()
    activeCancel.current?.()
    const pointerId = event.pointerId
    const seek = (clientX: number) => {
      const rect = scroll.getBoundingClientRect()
      session.seek(Math.max(0, Math.min(total, (clientX - rect.left + scroll.scrollLeft) / pixelsPerSecond)))
    }
    const move = (next: PointerEvent) => { if (next.pointerId === pointerId) seek(next.clientX) }
    const finish = (next?: Event) => {
      if (next && "pointerId" in next && next.pointerId !== pointerId) return
      if (activeCancel.current === finish) activeCancel.current = null
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      window.removeEventListener("blur", finish)
    }
    activeCancel.current = finish
    seek(event.clientX)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
    window.addEventListener("blur", finish)
  }, [active, pixelsPerSecond, session, total])

  const setZoomAt = useCallback((clientX: number, nextIndex: number) => {
    const scroll = scrollRef.current
    if (!active || !scroll) return
    const boundedIndex = Math.max(0, Math.min(levels.length - 1, nextIndex))
    if (boundedIndex === zoomIndex) return
    activeCancel.current?.()
    const pointer = clientX - scroll.getBoundingClientRect().left
    const time = (scroll.scrollLeft + pointer) / pixelsPerSecond
    session.setZoomLevel(zoomLevel(boundedIndex))
    scheduleFrame(() => programmaticScroll(() => { scroll.scrollLeft = Math.max(0, time * sampleRate / session.snapshot().engine.samplesPerPixel - pointer); setScrollLeft(scroll.scrollLeft) }))
  }, [active, levels.length, pixelsPerSecond, programmaticScroll, sampleRate, scheduleFrame, session, zoomIndex, zoomLevel])
  const setCenteredZoom = useCallback((nextIndex: number) => {
    const scroll = scrollRef.current
    if (!scroll) return
    const rect = scroll.getBoundingClientRect()
    setZoomAt(rect.left + rect.width / 2, nextIndex)
  }, [setZoomAt])
  const fitTimeline = useCallback(() => {
    const scroll = scrollRef.current
    if (!active || !scroll) return
    activeCancel.current?.()
    const target = Math.max(levels[0]!, Math.max(0, total) * sampleRate / Math.max(1, scroll.clientWidth))
    session.setZoomLevel(levels.find(level => level >= target) ?? levels.at(-1)!)
    setFollowPlayhead(false)
    scheduleFrame(() => { scroll.scrollLeft = 0; setScrollLeft(0) })
  }, [active, levels, sampleRate, scheduleFrame, session, total])
  const panTimeline = useCallback((event: ReactPointerEvent) => {
    const scroll = scrollRef.current
    if (!active || !scroll || activeCancel.current || event.button !== 0 || event.target !== event.currentTarget) return
    event.preventDefault()
    const pointerId = event.pointerId, originX = event.clientX, originScroll = scroll.scrollLeft
    setPanning(true); setFollowPlayhead(false)
    const move = (next: PointerEvent) => { if (next.pointerId === pointerId) { scroll.scrollLeft = originScroll - (next.clientX - originX); setScrollLeft(scroll.scrollLeft) } }
    const finish = (next?: Event) => {
      if (next && "pointerId" in next && next.pointerId !== pointerId) return
      setPanning(false)
      if (activeCancel.current === finish) activeCancel.current = null
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); window.removeEventListener("blur", finish)
    }
    activeCancel.current = finish
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); window.addEventListener("blur", finish)
  }, [active])
  const moveView = useCallback((direction: -1 | 1) => {
    const scroll = scrollRef.current
    if (!active || !scroll) return
    scroll.scrollLeft += direction * scroll.clientWidth * .6
    setScrollLeft(scroll.scrollLeft); setFollowPlayhead(false)
  }, [active])
  const syncVerticalScroll = useCallback((scrollTop: number) => {
    if (controlsRef.current) controlsRef.current.scrollTop = scrollTop
    if (scrollRef.current) setScrollLeft(scrollRef.current.scrollLeft)
    if (playback === "playing" && performance.now() > programmaticUntil.current) setFollowPlayhead(false)
  }, [playback])
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || typeof ResizeObserver === "undefined") return
    const resize = new ResizeObserver(([entry]) => setTimelineViewportWidth(Math.max(1, Math.floor(entry?.contentRect.width || scroll.clientWidth))))
    resize.observe(scroll)
    return () => resize.disconnect()
  }, [active])
  useEffect(() => {
    const scroll = scrollRef.current
    if (!active || !scroll) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) { event.preventDefault(); setZoomAt(event.clientX, zoomIndex + (event.deltaY < 0 ? 1 : -1)); return }
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault(); scroll.scrollLeft += event.shiftKey ? event.deltaY : event.deltaX
        setScrollLeft(scroll.scrollLeft); setFollowPlayhead(false)
      } else if (event.deltaY) setFollowPlayhead(false)
    }
    scroll.addEventListener("wheel", wheel, { passive: false })
    return () => scroll.removeEventListener("wheel", wheel)
  }, [active, setZoomAt, zoomIndex])
  useEffect(() => {
    const scroll = scrollRef.current
    if (!active || !followPlayhead || !scroll || playback !== "playing") return
    const x = playhead * pixelsPerSecond
    if (x < scroll.scrollLeft + 80 || x > scroll.scrollLeft + scroll.clientWidth - 100) {
      programmaticScroll(() => { const left = Math.max(0, x - scroll.clientWidth * .32); if (typeof scroll.scrollTo === "function") scroll.scrollTo({ left, behavior: "smooth" }); else scroll.scrollLeft = left })
    }
  }, [active, followPlayhead, pixelsPerSecond, playback, playhead, programmaticScroll])
  return { activeCancel, controlsRef, scrollRef, width, marks, zoomIndex, followPlayhead, setFollowPlayhead, panning, seekFromPointer, setCenteredZoom, fitTimeline, panTimeline, moveView, syncVerticalScroll }
}
