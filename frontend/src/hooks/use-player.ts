import { useCallback, useEffect, useRef, useState } from "react"

import type { PlayerCaptionTrack, PlayerSource } from "@/types/domain"

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
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [captionTrackId, setCaptionTrackIdState] = useState<string | null>(null)
  const captionTrackIdRef = useRef<string | null>(null)

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
      element.removeEventListener("timeupdate", updateTime)
      element.removeEventListener("durationchange", updateDuration)
      element.removeEventListener("playing", onPlaying)
      element.removeEventListener("pause", onPause)
      element.removeEventListener("waiting", onWaiting)
      element.removeEventListener("error", onError)
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
      const tracks = next.captionTracks || []
      if (!tracks.some((track) => track.id === captionTrackIdRef.current)) {
        const nextTrack = tracks.find((track) => !track.stale) || tracks[0] || null
        captionTrackIdRef.current = nextTrack?.id || null
        setCaptionTrackIdState(nextTrack?.id || null)
      }
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
    const nextTrack = next.captionTracks?.find((track) => !track.stale) || next.captionTracks?.[0] || null
    captionTrackIdRef.current = nextTrack?.id || null
    setCaptionTrackIdState(nextTrack?.id || null)
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
    setCaptionsEnabled(false)
    captionTrackIdRef.current = null
    setCaptionTrackIdState(null)
  }, [])

  const setCaptionTrack = useCallback((trackId: string | null) => {
    captionTrackIdRef.current = trackId
    setCaptionTrackIdState(trackId)
    setCaptionsEnabled(Boolean(trackId))
  }, [])

  const toggleCaptions = useCallback(() => {
    if (!sourceRef.current?.captionTracks?.length) return
    setCaptionsEnabled((current) => !current)
  }, [])

  const captionTracks = source?.captionTracks || []
  const captionTrack: PlayerCaptionTrack | null = captionTracks.find((track) => track.id === captionTrackId) || captionTracks[0] || null
  const positionMs = currentTime * 1000
  const currentCaptionCue = captionsEnabled && captionTrack
    ? captionTrack.cues.find((cue) => positionMs >= cue.startMs && positionMs < Math.max(cue.startMs + 1, cue.endMs)) || null
    : null

  return { source, state, currentTime, duration, volume, speed, captionTracks, captionTrack, captionsEnabled, currentCaptionCue, toggleSource, toggle, pause, seek, setVolume, setSpeed, close, setCaptionTrack, toggleCaptions }
}
