import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { SOUND_SCENE_ZOOM_LEVELS, soundSceneFitZoomIndex, soundSceneZoomIndex, soundSceneZoomLevel } from "@/features/sound-scene/engine/sound-scene-engine"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"

const SAMPLE_RATE = 48_000
const TICK_STEPS = [.1, .25, .5, 1, 2, 5, 10, 15, 30, 60]
export const VIEWER_DEFAULT_WIDTH = 320
export const VIEWER_MIN_WIDTH = 240
export const VIEWER_MAX_WIDTH = 520
const VIEWER_WIDTH_STORAGE_KEY = "auvi.timeline.viewer-width"

function tickStep(pixelsPerSecond: number) {
  return TICK_STEPS.find((step) => step * pixelsPerSecond >= 70) || 60
}

export function useTimelineViewport({ session, total, pixelsPerSecond, samplesPerPixel, playhead, playback }: {
  session: SoundSceneSession
  total: number
  pixelsPerSecond: number
  samplesPerPixel: number
  playhead: number
  playback: "idle" | "preparing" | "playing"
}) {
  const [viewerCollapsed, setViewerCollapsed] = useState(false)
  const [viewerWidth, setViewerWidth] = useState(() => {
    if (typeof window === "undefined") return VIEWER_DEFAULT_WIDTH
    try {
      const stored = Number(window.localStorage.getItem(VIEWER_WIDTH_STORAGE_KEY))
      return Number.isFinite(stored)
        ? Math.min(VIEWER_MAX_WIDTH, Math.max(VIEWER_MIN_WIDTH, stored))
        : VIEWER_DEFAULT_WIDTH
    } catch {
      return VIEWER_DEFAULT_WIDTH
    }
  })
  const [viewerResizing, setViewerResizing] = useState(false)
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const [panning, setPanning] = useState(false)
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(920)
  const scrollRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLElement>(null)
  const activeCancel = useRef<(() => void) | null>(null)
  const viewerResize = useRef<{ startX: number; startWidth: number } | null>(null)
  const zoomIndex = soundSceneZoomIndex(samplesPerPixel)
  const width = Math.max(timelineViewportWidth, Math.ceil(total * pixelsPerSecond))
  const step = tickStep(pixelsPerSecond)
  const marks = useMemo(
    () => Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step),
    [step, total],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEWER_WIDTH_STORAGE_KEY, String(Math.round(viewerWidth)))
    } catch {
      // Browser storage is an optional preference only.
    }
  }, [viewerWidth])

  const resizeViewer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = viewerResize.current
    if (!active) return
    const stageWidth = event.currentTarget.parentElement?.clientWidth || VIEWER_MAX_WIDTH * 2
    const maximum = Math.min(VIEWER_MAX_WIDTH, Math.max(VIEWER_MIN_WIDTH, stageWidth * .46))
    setViewerWidth(Math.min(maximum, Math.max(VIEWER_MIN_WIDTH, active.startWidth + event.clientX - active.startX)))
  }, [])

  const finishViewerResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!viewerResize.current) return
    resizeViewer(event)
    viewerResize.current = null
    setViewerResizing(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [resizeViewer])

  const adjustViewerWidth = useCallback((delta: number) => {
    setViewerWidth((current) => Math.min(VIEWER_MAX_WIDTH, Math.max(VIEWER_MIN_WIDTH, current + delta)))
  }, [])

  const beginViewerResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    viewerResize.current = { startX: event.clientX, startWidth: viewerWidth }
    setViewerResizing(true)
  }, [viewerWidth])

  const seekFromPointer = useCallback((event: ReactPointerEvent) => {
    const scroll = scrollRef.current
    if (!scroll) return
    let active = true
    const seek = (clientX: number) => {
      const rect = scroll.getBoundingClientRect()
      session.seek((clientX - rect.left + scroll.scrollLeft) / pixelsPerSecond)
    }
    seek(event.clientX)
    const move = (next: PointerEvent) => { if (active) seek(next.clientX) }
    const finish = () => {
      active = false
      window.removeEventListener("pointermove", move)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
  }, [pixelsPerSecond, session])

  const setZoomAt = useCallback((clientX: number, nextIndex: number) => {
    const scroll = scrollRef.current
    if (!scroll) return
    const boundedIndex = Math.max(0, Math.min(SOUND_SCENE_ZOOM_LEVELS.length - 1, nextIndex))
    if (boundedIndex === zoomIndex) return
    const rect = scroll.getBoundingClientRect()
    const pointer = clientX - rect.left
    const time = (scroll.scrollLeft + pointer) / pixelsPerSecond
    session.setZoomLevel(soundSceneZoomLevel(boundedIndex))
    requestAnimationFrame(() => {
      const nextPixelsPerSecond = SAMPLE_RATE / session.snapshot().engine.samplesPerPixel
      scroll.scrollLeft = Math.max(0, time * nextPixelsPerSecond - pointer)
    })
  }, [pixelsPerSecond, session, zoomIndex])

  const setCenteredZoom = useCallback((nextIndex: number) => {
    const scroll = scrollRef.current
    if (!scroll) return
    const rect = scroll.getBoundingClientRect()
    setZoomAt(rect.left + rect.width / 2, nextIndex)
  }, [setZoomAt])

  const fitTimeline = useCallback(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    session.setZoomLevel(soundSceneZoomLevel(soundSceneFitZoomIndex(total, scroll.clientWidth)))
    setFollowPlayhead(false)
    requestAnimationFrame(() => { scroll.scrollLeft = 0 })
  }, [session, total])

  const panTimeline = useCallback((event: ReactPointerEvent) => {
    const scroll = scrollRef.current
    if (!scroll || activeCancel.current || event.button !== 0 || event.target !== event.currentTarget) return
    event.preventDefault()
    const originX = event.clientX
    const originScroll = scroll.scrollLeft
    setPanning(true)
    setFollowPlayhead(false)
    const move = (next: PointerEvent) => { scroll.scrollLeft = originScroll - (next.clientX - originX) }
    const finish = () => {
      setPanning(false)
      activeCancel.current = null
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      window.removeEventListener("blur", finish)
    }
    activeCancel.current = finish
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", finish, { once: true })
    window.addEventListener("blur", finish, { once: true })
  }, [])

  const moveView = useCallback((direction: -1 | 1) => {
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollLeft += direction * scroll.clientWidth * .6
    setFollowPlayhead(false)
  }, [])

  const syncVerticalScroll = useCallback((scrollTop: number) => {
    if (controlsRef.current) controlsRef.current.scrollTop = scrollTop
    if (playback === "playing") setFollowPlayhead(false)
  }, [playback])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const resize = new ResizeObserver(([entry]) => setTimelineViewportWidth(
      Math.max(1, Math.floor(entry?.contentRect.width || scroll.clientWidth)),
    ))
    resize.observe(scroll)
    return () => resize.disconnect()
  }, [])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
        setZoomAt(event.clientX, zoomIndex + (event.deltaY < 0 ? 1 : -1))
        return
      }
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault()
        scroll.scrollLeft += event.shiftKey ? event.deltaY : event.deltaX
        setFollowPlayhead(false)
      }
    }
    scroll.addEventListener("wheel", wheel, { passive: false })
    return () => scroll.removeEventListener("wheel", wheel)
  }, [setZoomAt, zoomIndex])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!followPlayhead || !scroll || playback !== "playing") return
    const x = playhead * pixelsPerSecond
    if (x < scroll.scrollLeft + 80 || x > scroll.scrollLeft + scroll.clientWidth - 100) {
      scroll.scrollTo({ left: Math.max(0, x - scroll.clientWidth * .32), behavior: "smooth" })
    }
  }, [followPlayhead, pixelsPerSecond, playback, playhead])

  return {
    activeCancel,
    controlsRef,
    scrollRef,
    width,
    marks,
    zoomIndex,
    viewerCollapsed,
    setViewerCollapsed,
    viewerWidth,
    viewerResizing,
    resizeViewer,
    finishViewerResize,
    beginViewerResize,
    adjustViewerWidth,
    followPlayhead,
    setFollowPlayhead,
    panning,
    seekFromPointer,
    setCenteredZoom,
    fitTimeline,
    panTimeline,
    moveView,
    syncVerticalScroll,
  }
}
