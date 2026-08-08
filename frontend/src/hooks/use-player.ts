import { useCallback, useEffect, useRef, useState } from "react"

import type { PlayerSource } from "@/types/domain"

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "error"

export function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<PlayerSource | null>(null)
  const [source, setSource] = useState<PlayerSource | null>(null)
  const [state, setState] = useState<PlayerState>("idle")
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.85)
  const [speed, setSpeedState] = useState(1)

  useEffect(() => {
    const element = new Audio()
    element.preload = "metadata"
    element.volume = volume
    element.playbackRate = speed
    audio.current = element
    const updateTime = () => setCurrentTime(element.currentTime || 0)
    const updateDuration = () => setDuration(Number.isFinite(element.duration) ? element.duration : 0)
    const onPlaying = () => setState("playing")
    const onPause = () => setState(sourceRef.current ? "paused" : "idle")
    const onWaiting = () => setState("loading")
    const onError = () => setState("error")
    element.addEventListener("timeupdate", updateTime)
    element.addEventListener("durationchange", updateDuration)
    element.addEventListener("playing", onPlaying)
    element.addEventListener("pause", onPause)
    element.addEventListener("waiting", onWaiting)
    element.addEventListener("error", onError)
    const onEnded = () => setState("paused")
    element.addEventListener("ended", onEnded)
    return () => {
      element.pause()
      element.removeAttribute("src")
      element.removeEventListener("ended", onEnded)
      audio.current = null
    }
  }, [])

  const toggleSource = useCallback(async (next: PlayerSource) => {
    const element = audio.current
    if (!element) return
    if (sourceRef.current?.key === next.key && sourceRef.current.url === next.url) {
      sourceRef.current = next
      setSource(next)
      if (element.paused) {
        if (element.ended || (Number.isFinite(element.duration) && element.currentTime >= element.duration - 0.05)) element.currentTime = 0
        setState("loading")
        try { await element.play() } catch { setState("error") }
      } else {
        element.pause()
      }
      return
    }
    if (!element.paused) element.pause()
    element.src = next.url
    element.currentTime = 0
    element.volume = volume
    element.playbackRate = speed
    sourceRef.current = next
    setCurrentTime(0)
    setDuration(0)
    setSource(next)
    setState("loading")
    try {
      await element.play()
    } catch {
      setState("error")
    }
  }, [speed, volume])

  const toggle = useCallback(async () => {
    const element = audio.current
    if (!element || !source) return
    if (!element.paused) {
      element.pause()
      return
    }
    if (element.ended || (Number.isFinite(element.duration) && element.currentTime >= element.duration - 0.05)) element.currentTime = 0
    setState("loading")
    try { await element.play() } catch { setState("error") }
  }, [source])

  const pause = useCallback(() => {
    audio.current?.pause()
  }, [])

  const seek = useCallback((seconds: number) => {
    if (!audio.current) return
    audio.current.currentTime = Math.max(0, Math.min(seconds, duration || seconds))
    setCurrentTime(audio.current.currentTime)
  }, [duration])

  const setVolume = useCallback((next: number) => {
    const safe = Math.max(0, Math.min(1, next))
    setVolumeState(safe)
    if (audio.current) audio.current.volume = safe
  }, [])

  const setSpeed = useCallback((next: number) => {
    const safe = Math.max(0.5, Math.min(2, next))
    setSpeedState(safe)
    if (audio.current) audio.current.playbackRate = safe
  }, [])

  const close = useCallback(() => {
    if (audio.current) {
      if (!audio.current.paused) audio.current.pause()
      audio.current.removeAttribute("src")
    }
    sourceRef.current = null
    setSource(null)
    setState("idle")
    setCurrentTime(0)
    setDuration(0)
  }, [])

  return { source, state, currentTime, duration, volume, speed, toggleSource, toggle, pause, seek, setVolume, setSpeed, close }
}
