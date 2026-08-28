import { useCallback, useMemo, useState } from "react"

import type { SoundSceneTrack, VisualSceneTrack } from "@/types/domain"

type SequenceSpan = {
  start_ms: number
  duration_ms: number
}

export function useTimelineSnapping({ pixelsPerSecond, playhead, sequence, audioTracks, visualTracks }: {
  pixelsPerSecond: number
  playhead: number
  sequence: SequenceSpan[]
  audioTracks: SoundSceneTrack[]
  visualTracks: VisualSceneTrack[]
}) {
  const [enabled, setEnabled] = useState(true)
  const [guide, setGuide] = useState<number | null>(null)
  const targets = useMemo(() => {
    const values = new Set<number>([0, playhead])
    sequence.forEach((span) => {
      values.add(span.start_ms / 1000)
      values.add((span.start_ms + span.duration_ms) / 1000)
    })
    audioTracks.forEach((track) => track.clips.forEach((clip) => {
      if (clip.orphan) return
      const start = Number(clip.resolved_start_ms || 0) / 1000
      values.add(start)
      values.add(start + Number(clip.resolved_duration_ms || 0) / 1000)
    }))
    visualTracks.forEach((track) => track.clips.forEach((clip) => {
      values.add(clip.start_ms / 1000)
      values.add((clip.start_ms + clip.duration_ms) / 1000)
    }))
    return [...values].sort((left, right) => left - right)
  }, [audioTracks, playhead, sequence, visualTracks])

  const snap = useCallback((value: number, bypass: boolean) => {
    if (!enabled || bypass) {
      setGuide(null)
      return value
    }
    const tolerance = 8 / pixelsPerSecond
    const nearest = targets.reduce<number | null>((best, target) =>
      Math.abs(target - value) <= tolerance
      && (best === null || Math.abs(target - value) < Math.abs(best - value))
        ? target
        : best, null)
    setGuide(nearest)
    return nearest ?? value
  }, [enabled, pixelsPerSecond, targets])

  const changeEnabled = useCallback((next: boolean) => {
    setEnabled(next)
    setGuide(null)
  }, [])

  return { enabled, guide, snap, clearGuide: () => setGuide(null), changeEnabled }
}
