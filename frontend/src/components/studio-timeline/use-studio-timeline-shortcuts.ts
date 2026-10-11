import {useEffect, useRef} from 'react'

export type StudioTimelineShortcutOptions = {
  active?: boolean
  editable?: boolean
  /** A mounted workspace owns only events within this ref or selector. */
  scope?: {current: HTMLElement | null} | string
  activeCancel: {current: (() => void) | null}
  hasAudioSelection: boolean
  hasVisualSelection: boolean
  /** Includes a protected Script selection, which may be cleared but never edited here. */
  hasSelection?: boolean
  canSplitVisual: boolean
  canSplitAudio?: boolean
  canDuplicateAudio?: boolean
  canDuplicateVisual?: boolean
  canNudgeAudio?: boolean
  canNudgeVisual?: boolean
  canTogglePlayback?: boolean
  canUndo?: boolean
  canRedo?: boolean
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
}
const overlay = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [data-studio-shortcuts="ignore"]'
const interactive = 'input, textarea, select, button, a[href], audio, video, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="combobox"], [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="spinbutton"]'
const surface = '[data-timeline-shortcut-surface="true"]'

/** Explicit clip surfaces opt in; their nested editor controls keep their own keys. */
export function acceptsStudioTimelineShortcut(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  if (target.closest(overlay)) return false
  const control = target.closest(interactive)
  return !control || control.matches(surface)
}

/** Shared key policy. Persistence, selection and playback remain host-owned callbacks. */
export function dispatchStudioTimelineShortcut(event: KeyboardEvent, options: StudioTimelineShortcutOptions): boolean {
  if (options.active === false || event.defaultPrevented || event.isComposing || event.keyCode === 229) return false
  const path = event.composedPath?.() ?? []
  const elements = path.filter((item): item is Element => item instanceof Element)
  if (event.target instanceof Element && !elements.includes(event.target)) elements.unshift(event.target)
  if (options.scope) {
    const scope = options.scope
    const inside = typeof scope === 'string'
      ? elements.some(element => !!element.closest(scope))
      : !!scope.current && elements.some(element => scope.current!.contains(element))
    if (!inside) return false
  }
  if (!acceptsStudioTimelineShortcut(event.target) || elements.some(element => !acceptsStudioTimelineShortcut(element))) return false
  // A modal/menu is a separate keyboard owner even if an old clip still has focus.
  if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')) return false
  const command = event.metaKey || event.ctrlKey, key = event.key.toLowerCase(), editable = options.editable !== false
  const consume = (action: () => void, repeatable = false) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat || repeatable) action()
    return true
  }
  if (command) {
    if (event.altKey) return false
    if (key === 'z' && editable && (event.shiftKey ? options.canRedo !== false : options.canUndo !== false)) return consume(event.shiftKey ? options.redo : options.undo)
    if (key === 'y' && event.ctrlKey && !event.shiftKey && editable && options.canRedo !== false) return consume(options.redo)
    if (key === 'd' && !event.shiftKey && editable) {
      if (options.hasAudioSelection && options.canDuplicateAudio !== false) return consume(options.duplicateAudio)
      if (options.hasVisualSelection && options.canDuplicateVisual !== false) return consume(options.duplicateVisual)
    }
    if (key === 'l' && !event.shiftKey && options.hasAudioSelection) return consume(() => options.playAudioSelection(true))
    return false
  }
  if ((event.code === 'Space' || event.key === ' ') && !event.altKey && !event.shiftKey && options.canTogglePlayback !== false) return consume(options.togglePlayback)
  if (key === 's' && !event.altKey && !event.shiftKey && editable) {
    if (options.hasVisualSelection && options.canSplitVisual) return consume(options.splitVisual)
    if (options.hasAudioSelection && options.canSplitAudio !== false) return consume(options.splitAudio)
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && editable) {
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.altKey ? 10 : event.shiftKey ? 1_000 : 100)
    if (options.hasAudioSelection && options.canNudgeAudio !== false) return consume(() => options.nudgeAudio(delta), true)
    if (options.hasVisualSelection && options.canNudgeVisual !== false) return consume(() => options.nudgeVisual(delta), true)
  }
  if ((event.key === 'Home' || event.key === '0') && !event.altKey && !event.shiftKey) return consume(options.seekStart)
  if (!event.altKey && (event.key === '-' || event.key === '_')) return consume(() => options.zoom(-1), true)
  if (!event.altKey && (event.key === '=' || event.key === '+')) return consume(() => options.zoom(1), true)
  if (event.key === 'Escape') {
    if (options.activeCancel.current) return consume(options.activeCancel.current)
    if (options.hasSelection ?? (options.hasAudioSelection || options.hasVisualSelection)) return consume(options.clearSelection)
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.shiftKey && editable) {
    // A removed clip cannot keep focus. Return ownership before the host removes
    // its DOM node so the next Undo remains inside this workspace.
    const deleteSelection = (action: () => void) => consume(() => {
      const owner = typeof options.scope === 'string'
        ? elements.find(element => !!element.closest(options.scope as string))?.closest(options.scope)
        : options.scope?.current
      if (owner instanceof HTMLElement) owner.focus({preventScroll:true})
      action()
    })
    if (options.hasAudioSelection && options.canDeleteAudio) return deleteSelection(options.deleteAudio)
    if (options.hasVisualSelection && options.canDeleteVisual) return deleteSelection(options.deleteVisual)
  }
  return false
}

export function useStudioTimelineShortcuts(options: StudioTimelineShortcutOptions) {
  const current = useRef(options)
  current.current = options
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { dispatchStudioTimelineShortcut(event, current.current) }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])
}
