import { useCallback, type PointerEvent as ReactPointerEvent } from "react"

import type { SoundClipRef, SoundSceneSession, SoundSceneSessionSnapshot } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"

const SAMPLE_RATE = 48_000
export type AudioGestureMode = "move" | "left" | "right" | "gain" | "fade-in" | "fade-out"

export function useAudioTimelineGestures({ session, visualSession, engine, selectedRefs, saving, pixelsPerSecond, snap, clearSnapGuide, activeCancel }: {
  session: SoundSceneSession
  visualSession?: VisualSceneSession
  engine: SoundSceneSessionSnapshot["engine"]
  selectedRefs: SoundClipRef[]
  saving: boolean
  pixelsPerSecond: number
  snap: (value: number, bypass: boolean) => number
  clearSnapGuide: () => void
  activeCancel: { current: (() => void) | null }
}) {
  return useCallback((event: ReactPointerEvent, trackId: string, clipId: string, mode: AudioGestureMode) => {
    if (event.button !== 0 || saving) return
    event.stopPropagation()
    visualSession?.select(null)
    const grabbedWasSelected = selectedRefs.some((ref) => ref.trackId === trackId && ref.clipId === clipId)
    const preserveGroup = mode === "move" && grabbedWasSelected && selectedRefs.length > 1
    if (!preserveGroup) session.selectClip(trackId, clipId, event.shiftKey || event.metaKey || event.ctrlKey)
    const movingRefs = mode === "move"
      ? (preserveGroup ? selectedRefs : session.selectedClips())
      : [{ trackId, clipId }]
    const engineTrack = engine.tracks.find((track) => track.id === trackId)
    const initial = engineTrack?.clips.find((clip) => clip.id === clipId)
    const persisted = session.currentClip(trackId, clipId)
    if (!initial || !persisted) return
    if (mode === "move" && !session.canMoveClips(movingRefs)) return
    if (persisted.locked && ["left", "right"].includes(mode)) {
      session.reportError("Unlock this clip before trimming it.")
      return
    }
    const originX = event.clientX
    const originY = event.clientY
    let started = false
    let appliedSamples = 0
    let finished = false
    const begin = () => {
      if (started) return
      started = true
      session.beginGesture()
    }
    const move = (next: PointerEvent) => {
      const dx = next.clientX - originX
      const dy = next.clientY - originY
      if (!started && Math.hypot(dx, dy) < 4) return
      begin()
      if (mode === "gain") {
        const initialDb = persisted.gain <= .001 ? -60 : 20 * Math.log10(persisted.gain)
        const gain = Math.min(2, Math.max(0, 10 ** (Math.max(-60, Math.min(6, initialDb - dy * .25)) / 20)))
        session.updateClip(trackId, clipId, { gain })
        return
      }
      if (mode === "fade-in" || mode === "fade-out") {
        const durationMs = Number(persisted.resolved_duration_ms || persisted.duration_ms || 0)
        const original = mode === "fade-in" ? persisted.fade_in_ms : persisted.fade_out_ms
        const milliseconds = Math.max(0, Math.min(
          durationMs,
          original + (mode === "fade-in" ? dx : -dx) / pixelsPerSecond * 1000,
        ))
        session.updateClip(trackId, clipId, {
          [mode === "fade-in" ? "fade_in_ms" : "fade_out_ms"]: Math.round(milliseconds),
        })
        return
      }
      const originalStart = initial.startSample / SAMPLE_RATE
      const originalEnd = (initial.startSample + initial.durationSamples) / SAMPLE_RATE
      let seconds = dx / pixelsPerSecond
      if (mode === "move" || mode === "left") seconds = snap(originalStart + seconds, next.altKey) - originalStart
      if (mode === "right") seconds = snap(originalEnd + seconds, next.altKey) - originalEnd
      const targetSamples = Math.round(seconds * SAMPLE_RATE)
      const deltaSamples = targetSamples - appliedSamples
      appliedSamples = targetSamples
      if (mode === "move") session.moveClips(movingRefs, deltaSamples)
      else session.trimClip(trackId, clipId, mode, deltaSamples)
    }
    const cleanup = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", cancel)
      activeCancel.current = null
      clearSnapGuide()
    }
    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      if (started) void session.commitGesture()
    }
    const cancel = () => {
      if (finished) return
      finished = true
      cleanup()
      if (started) session.cancelGesture()
    }
    activeCancel.current = cancel
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", cancel, { once: true })
    window.addEventListener("blur", cancel, { once: true })
  }, [activeCancel, clearSnapGuide, engine.tracks, pixelsPerSecond, saving, selectedRefs, session, snap, visualSession])
}
