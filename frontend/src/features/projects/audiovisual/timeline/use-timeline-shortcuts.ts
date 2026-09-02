import { useEffect } from "react"

export function acceptsTimelineShortcut(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  if (target.matches("[data-timeline-shortcut-surface='true']")) return true
  return !target.closest("input, textarea, select, button, a[href], [contenteditable='true'], [role='slider'], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], [role='dialog']")
}

export function useTimelineShortcuts({ activeCancel, hasAudioSelection, hasVisualSelection, canSplitVisual, undo, redo, duplicateAudio, duplicateVisual, splitAudio, splitVisual, playAudioSelection, togglePlayback, nudgeAudio, nudgeVisual, seekStart, zoom, clearSelection, canDeleteAudio, canDeleteVisual, deleteAudio, deleteVisual }: {
  activeCancel: { current: (() => void) | null }
  hasAudioSelection: boolean
  hasVisualSelection: boolean
  canSplitVisual: boolean
  undo: () => void
  redo: () => void
  duplicateAudio: () => void
  duplicateVisual: () => void
  splitAudio: () => void
  splitVisual: () => void
  playAudioSelection: (loop: boolean) => void
  togglePlayback: () => void
  nudgeAudio: (deltaMs: number) => void
  nudgeVisual: (deltaMs: number) => void
  seekStart: () => void
  zoom: (delta: number) => void
  clearSelection: () => void
  canDeleteAudio: boolean
  canDeleteVisual: boolean
  deleteAudio: () => void
  deleteVisual: () => void
}) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !acceptsTimelineShortcut(event.target)) return
      const command = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (command && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (command && key === "d" && hasAudioSelection) {
        event.preventDefault()
        duplicateAudio()
        return
      }
      if (command && key === "d" && hasVisualSelection) {
        event.preventDefault()
        duplicateVisual()
        return
      }
      if (key === "s" && hasVisualSelection && canSplitVisual && !command) {
        event.preventDefault()
        splitVisual()
        return
      }
      if (command && key === "l" && hasAudioSelection) {
        event.preventDefault()
        playAudioSelection(true)
        return
      }
      if (event.code === "Workspace") {
        event.preventDefault()
        togglePlayback()
        return
      }
      if (key === "s" && hasAudioSelection && !command) {
        event.preventDefault()
        splitAudio()
        return
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && hasAudioSelection) {
        event.preventDefault()
        const amount = event.altKey ? 10 : event.shiftKey ? 1_000 : 100
        nudgeAudio((event.key === "ArrowLeft" ? -1 : 1) * amount)
        return
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && hasVisualSelection) {
        event.preventDefault()
        const amount = event.altKey ? 10 : event.shiftKey ? 1_000 : 100
        nudgeVisual((event.key === "ArrowLeft" ? -1 : 1) * amount)
        return
      }
      if (event.key === "Home" || event.key === "0") {
        event.preventDefault()
        seekStart()
        return
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault()
        zoom(-1)
        return
      }
      if (event.key === "=" || event.key === "+") {
        event.preventDefault()
        zoom(1)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        if (activeCancel.current) activeCancel.current()
        else clearSelection()
        return
      }
      if ((event.key === "Delete" || event.key === "Backspace") && hasAudioSelection && canDeleteAudio) {
        event.preventDefault()
        deleteAudio()
        return
      }
      if ((event.key === "Delete" || event.key === "Backspace") && hasVisualSelection && canDeleteVisual) {
        event.preventDefault()
        deleteVisual()
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [activeCancel, canDeleteAudio, canDeleteVisual, canSplitVisual, clearSelection, deleteAudio, deleteVisual, duplicateAudio, duplicateVisual, hasAudioSelection, hasVisualSelection, nudgeAudio, nudgeVisual, playAudioSelection, redo, seekStart, splitAudio, splitVisual, togglePlayback, undo, zoom])
}
