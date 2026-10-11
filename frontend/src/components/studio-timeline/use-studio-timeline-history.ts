import { useCallback, useEffect, useRef, useState } from "react"

export type TimelineHistoryDomain = "audio" | "visual"
export type TimelineAudioRevisionKind = "operator" | "derived_visual_audio" | "history" | "external"

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

export type StudioTimelineDualHistoryOptions = {
  audioRevision: number
  audioRevisionKind: TimelineAudioRevisionKind
  visualRevision: number
  audioCanUndo: boolean
  audioCanRedo: boolean
  visualCanUndo: boolean
  visualCanRedo: boolean
  undoAudio: () => Promise<unknown>
  redoAudio: () => Promise<unknown>
  undoVisual?: () => Promise<unknown>
  redoVisual?: () => Promise<unknown>
}
export type StudioTimelineCompositionHistoryOwner = {
  canUndo: boolean
  canRedo: boolean
  undo: () => unknown
  redo: () => unknown
}
export type StudioTimelineHistoryOptions = StudioTimelineDualHistoryOptions | {owner: StudioTimelineCompositionHistoryOwner}

export type StudioTimelineDualHistoryPort = {
  canUndo: boolean; canRedo: boolean
  undoDomain: TimelineHistoryDomain; redoDomain: TimelineHistoryDomain
  undo: () => Promise<void>; redo: () => Promise<void>
}
export type StudioTimelineCompositionHistoryPort = StudioTimelineCompositionHistoryOwner & {
  undoDomain: 'composition'; redoDomain: 'composition'
}
/** Dual Studio services arbitrate domain order; a Project's composition port stays its sole history owner. */
export function useStudioTimelineHistory(options: StudioTimelineDualHistoryOptions): StudioTimelineDualHistoryPort
export function useStudioTimelineHistory(options: {owner: StudioTimelineCompositionHistoryOwner}): StudioTimelineCompositionHistoryPort
export function useStudioTimelineHistory(options: StudioTimelineHistoryOptions) {
  const dual = 'owner' in options ? null : options
  const {audioRevision = 0, audioRevisionKind = 'operator', visualRevision = 0, audioCanUndo = false, audioCanRedo = false, visualCanUndo = false, visualCanRedo = false, undoAudio, redoAudio, undoVisual, redoVisual} = dual ?? {}
  const inFlight = useRef(false)
  const [undoDomains, setUndoDomains] = useState<TimelineHistoryDomain[]>([])
  const [redoDomains, setRedoDomains] = useState<TimelineHistoryDomain[]>([])
  const previous = useRef<Revisions>({ audio: audioRevision, visual: visualRevision })
  const ignored = useRef<Partial<Record<TimelineHistoryDomain, boolean>>>({})

  useEffect(() => {
    if (!dual) return
    const revisions: Revisions = { audio: audioRevision, visual: visualRevision }
    const changed = (Object.keys(revisions) as TimelineHistoryDomain[]).filter(
      (domain) => revisions[domain] !== previous.current[domain],
    )
    previous.current = revisions
    const committed = changed.filter((domain) => {
      if (domain === "audio" && audioRevisionKind === "derived_visual_audio") return false
      if (!ignored.current[domain]) return true
      ignored.current[domain] = false
      return false
    })
    if (!committed.length) return
    setUndoDomains((current) => [...current, ...committed])
    setRedoDomains([])
  }, [audioRevision, audioRevisionKind, visualRevision])

  const undoAvailable = { audio: audioCanUndo, visual: visualCanUndo }
  const redoAvailable = { audio: audioCanRedo, visual: visualCanRedo }
  const undoDomain = availableDomain(undoDomains, undoAvailable, "audio")
  const redoDomain = availableDomain(redoDomains, redoAvailable, undoDomain)
  const canUndo = undoAvailable[undoDomain]
  const canRedo = redoAvailable[redoDomain]

  const runUndo = useCallback(async () => {
    const domain = availableDomain(undoDomains, { audio: audioCanUndo, visual: visualCanUndo }, "audio")
    const action = domain === "visual" ? undoVisual : undoAudio
    if (inFlight.current || !action || !(domain === "visual" ? visualCanUndo : audioCanUndo)) return
    inFlight.current = true
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
    } finally {
      inFlight.current = false
    }
  }, [audioCanUndo, undoAudio, undoDomains, undoVisual, visualCanUndo])

  const runRedo = useCallback(async () => {
    const domain = availableDomain(redoDomains, { audio: audioCanRedo, visual: visualCanRedo }, undoDomain)
    const action = domain === "visual" ? redoVisual : redoAudio
    if (inFlight.current || !action || !(domain === "visual" ? visualCanRedo : audioCanRedo)) return
    inFlight.current = true
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
    } finally {
      inFlight.current = false
    }
  }, [audioCanRedo, redoAudio, redoDomains, redoVisual, undoDomain, visualCanRedo])

  if ('owner' in options) return {...options.owner, undoDomain: 'composition' as const, redoDomain: 'composition' as const}
  return {
    canUndo,
    canRedo,
    undoDomain,
    redoDomain,
    undo: runUndo,
    redo: runRedo,
  }
}
