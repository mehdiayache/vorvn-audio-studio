import { useEffect } from "react"

export type PlayerShortcutControls = {
  hasSource: boolean
  currentTime: number
  toggle: () => Promise<void>
  seek: (seconds: number) => void
}

export function usePlayerShortcuts(controls: PlayerShortcutControls, closeTransientUi: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const editing = target?.matches("input, textarea, select, [contenteditable='true']")
      if (event.key === "Escape" && !editing) {
        closeTransientUi()
        return
      }
      if (editing || !controls.hasSource) return
      if (event.code === "Space") { event.preventDefault(); void controls.toggle() }
      if (event.key === "ArrowLeft") { event.preventDefault(); controls.seek(controls.currentTime - 5) }
      if (event.key === "ArrowRight") { event.preventDefault(); controls.seek(controls.currentTime + 5) }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [controls, closeTransientUi])
}
