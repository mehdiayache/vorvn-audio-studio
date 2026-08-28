import { useCallback, useEffect, useRef, useState } from "react"

export type TimelineHistoryDomain = "audio" | "visual"

type DomainState = Record<TimelineHistoryDomain, boolean>
type Revisions = Record<TimelineHistoryDomain, number>

function availableDomain(stack: TimelineHistoryDomain[], available: DomainState, fallback: TimelineHistoryDomain) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const domain = stack[index]!
    if (available[domain]) return domain
  }
  if (available[fallback]) return fallback
  return fallback === "audio" && available.visual ? "visual" : "audio"
}

export function useTimelineHistory({ audioRevision, visualRevision, audioCanUndo, audioCanRedo, visualCanUndo, visualCanRedo, undoAudio, redoAudio, undoVisual, redoVisual }: {
  audioRevision: number
  visualRevision: number
  audioCanUndo: boolean
  audioCanRedo: boolean
  visualCanUndo: boolean
  visualCanRedo: boolean
  undoAudio: () => Promise<unknown>
  redoAudio: () => Promise<unknown>
  undoVisual?: () => Promise<unknown>
  redoVisual?: () => Promise<unknown>
}) {
  const [undoDomains, setUndoDomains] = useState<TimelineHistoryDomain[]>([])
  const [redoDomains, setRedoDomains] = useState<TimelineHistoryDomain[]>([])
  const previous = useRef<Revisions>({ audio: audioRevision, visual: visualRevision })
  const ignored = useRef<Partial<Record<TimelineHistoryDomain, boolean>>>({})

  useEffect(() => {
    const revisions: Revisions = { audio: audioRevision, visual: visualRevision }
    const changed = (Object.keys(revisions) as TimelineHistoryDomain[]).filter(
      (domain) => revisions[domain] !== previous.current[domain],
    )
    previous.current = revisions
    const committed = changed.filter((domain) => {
      if (!ignored.current[domain]) return true
      ignored.current[domain] = false
      return false
    })
    if (!committed.length) return
    setUndoDomains((current) => [...current, ...committed])
    setRedoDomains([])
  }, [audioRevision, visualRevision])

  const undoAvailable = { audio: audioCanUndo, visual: visualCanUndo }
  const redoAvailable = { audio: audioCanRedo, visual: visualCanRedo }
  const undoDomain = availableDomain(undoDomains, undoAvailable, "audio")
  const redoDomain = availableDomain(redoDomains, redoAvailable, undoDomain)
  const canUndo = undoAvailable[undoDomain]
  const canRedo = redoAvailable[redoDomain]

  const runUndo = useCallback(async () => {
    const domain = availableDomain(undoDomains, { audio: audioCanUndo, visual: visualCanUndo }, "audio")
    const action = domain === "visual" ? undoVisual : undoAudio
    if (!action || !(domain === "visual" ? visualCanUndo : audioCanUndo)) return
    ignored.current[domain] = true
    try {
      await action()
      setUndoDomains((current) => {
        const next = [...current]
        const index = next.lastIndexOf(domain)
        if (index >= 0) next.splice(index, 1)
        return next
      })
      setRedoDomains((current) => [...current, domain])
    } catch (reason) {
      ignored.current[domain] = false
      throw reason
    }
  }, [audioCanUndo, undoAudio, undoDomains, undoVisual, visualCanUndo])

  const runRedo = useCallback(async () => {
    const domain = availableDomain(redoDomains, { audio: audioCanRedo, visual: visualCanRedo }, undoDomain)
    const action = domain === "visual" ? redoVisual : redoAudio
    if (!action || !(domain === "visual" ? visualCanRedo : audioCanRedo)) return
    ignored.current[domain] = true
    try {
      await action()
      setRedoDomains((current) => {
        const next = [...current]
        const index = next.lastIndexOf(domain)
        if (index >= 0) next.splice(index, 1)
        return next
      })
      setUndoDomains((current) => [...current, domain])
    } catch (reason) {
      ignored.current[domain] = false
      throw reason
    }
  }, [audioCanRedo, redoAudio, redoDomains, redoVisual, undoDomain, visualCanRedo])

  return {
    canUndo,
    canRedo,
    undoDomain,
    redoDomain,
    undo: runUndo,
    redo: runRedo,
  }
}
