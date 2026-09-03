import { useCallback, type PointerEvent as ReactPointerEvent } from "react"

import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { WorkspaceFile, VisualSceneTrack } from "@/types/domain"

export function useVisualTimelineGestures({ session, visualSession, files, visualTracks, selectedRefs, saving, pixelsPerSecond, snap, clearSnapGuide, activeCancel }: {
  session: SoundSceneSession
  visualSession?: VisualSceneSession
  files: WorkspaceFile[]
  visualTracks: VisualSceneTrack[]
  selectedRefs: VisualClipRef[]
  saving: boolean
  pixelsPerSecond: number
  snap: (value: number, bypass: boolean) => number
  clearSnapGuide: () => void
  activeCancel: { current: (() => void) | null }
}) {
  return useCallback((event: ReactPointerEvent, ref: VisualClipRef, mode: "move" | "start" | "end") => {
    const initial = visualSession?.currentClip(ref)
    if (!visualSession || !initial || event.button !== 0 || saving) return
    event.preventDefault()
    event.stopPropagation()
    const grabbedWasSelected = selectedRefs.some((item) => item.trackId === ref.trackId && item.clipId === ref.clipId)
    if (!(mode === "move" && grabbedWasSelected && selectedRefs.length > 1)) {
      visualSession.selectClip(ref, event.shiftKey || event.metaKey || event.ctrlKey)
    }
    session.select(null)
    if (initial.locked || visualTracks.find((track) => track.id === ref.trackId)?.locked) {
      visualSession.reportError("Unlock this visual before changing its timing.")
      return
    }
    const originX = event.clientX
    const originalStart = initial.start_ms
    const originalEnd = initial.start_ms + initial.duration_ms
    let started = false
    let finished = false
    const move = (next: PointerEvent) => {
      const dx = next.clientX - originX
      if (!started && Math.abs(dx) < 4) return
      if (!started) {
        started = true
        visualSession.beginGesture()
      }
      const deltaMs = dx / pixelsPerSecond * 1000
      const file = files.find((item) => item.id === initial.file_id)
      if (mode === "move") {
        visualSession.moveClip(ref, snap(originalStart / 1000 + deltaMs / 1000, next.altKey) * 1000)
      } else if (mode === "start") {
        visualSession.trimClip(ref, "start", snap(originalStart / 1000 + deltaMs / 1000, next.altKey) * 1000, file)
      } else {
        visualSession.trimClip(ref, "end", snap(originalEnd / 1000 + deltaMs / 1000, next.altKey) * 1000, file)
      }
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
      if (started) void visualSession.commitGesture()
    }
    const cancel = () => {
      if (finished) return
      finished = true
      cleanup()
      if (started) visualSession.cancelGesture()
    }
    activeCancel.current = cancel
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
    window.addEventListener("pointercancel", cancel, { once: true })
    window.addEventListener("blur", cancel, { once: true })
  }, [activeCancel, files, clearSnapGuide, pixelsPerSecond, saving, selectedRefs, session, snap, visualSession, visualTracks])
}
