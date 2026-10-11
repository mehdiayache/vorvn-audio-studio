import { useCallback, useMemo, useState } from "react"

export type TimelineSnapAudioTrack = { clips: readonly { id: string; orphan?: boolean; resolved_start_ms?: number | null; resolved_duration_ms?: number }[] }
export type TimelineSnapVisualTrack = { clips: readonly { id: string; start_ms: number; duration_ms: number }[] }

type SequenceSpan = {
  start_ms: number
  duration_ms: number
}
const NO_EXCLUSIONS: readonly string[] = []

export function useTimelineSnapping({ pixelsPerSecond, playhead, sequence, audioTracks, visualTracks, excludeClipIds = NO_EXCLUSIONS }: {
  pixelsPerSecond: number
  playhead: number
  sequence: readonly SequenceSpan[]
  audioTracks: readonly TimelineSnapAudioTrack[]
  visualTracks: readonly TimelineSnapVisualTrack[]
  excludeClipIds?: readonly string[]
}) {
  const [enabled, setEnabled] = useState(true)
  const [guide, setGuide] = useState<number | null>(null)
  const targets = useMemo(() => {
    const excluded = new Set(excludeClipIds)
    const values = new Set<number>([0, playhead])
    sequence.forEach((span) => {
      values.add(span.start_ms / 1000)
      values.add((span.start_ms + span.duration_ms) / 1000)
    })
    audioTracks.forEach((track) => track.clips.forEach((clip) => {
      if (clip.orphan || excluded.has(clip.id)) return
      const start = Number(clip.resolved_start_ms || 0) / 1000
      values.add(start)
      values.add(start + Number(clip.resolved_duration_ms || 0) / 1000)
    }))
    visualTracks.forEach((track) => track.clips.forEach((clip) => {
      if (excluded.has(clip.id)) return
      values.add(clip.start_ms / 1000)
      values.add((clip.start_ms + clip.duration_ms) / 1000)
    }))
    return [...values].sort((left, right) => left - right)
  }, [audioTracks, playhead, sequence, visualTracks, excludeClipIds])

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

  const snapPlacement = useCallback((start: number, duration: number, bypass: boolean) => {
    if (!enabled || bypass) { setGuide(null); return start }
    const tolerance = 8 / pixelsPerSecond
    let nearest: { target: number; offset: number; distance: number } | null = null
    for (const target of targets) for (const edge of [start, start + duration]) {
      const offset = target - edge, distance = Math.abs(offset)
      if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = { target, offset, distance }
    }
    setGuide(nearest?.target ?? null)
    return nearest ? start + nearest.offset : start
  }, [enabled, pixelsPerSecond, targets])

  return { enabled, guide, snap, snapPlacement, clearGuide: () => setGuide(null), changeEnabled }
}
