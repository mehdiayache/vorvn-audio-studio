import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { originsApi } from "@/lib/api"
import { contextWire, meaningfulDraft } from "@/lib/creator-draft-persistence"
import type { CompositionContext, RecoverableCompositionDraft } from "@/lib/creator-contract"

type RecoveryStatus = "loading" | "ready" | "saving" | "saved" | "conflict" | "error"

export function useCreatorDraftRecovery(input: {
  context: CompositionContext
  draft: RecoverableCompositionDraft
  onRestore: (draft: RecoverableCompositionDraft) => void
  enabled?: boolean
}) {
  const { context, draft } = input
  const enabled = input.enabled !== false
  const contextId = useMemo(() => enabled ? JSON.stringify(contextWire(context)) : "disabled", [context, enabled])
  const serialized = useMemo(() => JSON.stringify(draft), [draft])
  const restoreRef = useRef(input.onRestore)
  const versionRef = useRef<number | null>(null)
  const readyRef = useRef(false)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())
  const loadRef = useRef<Promise<unknown>>(Promise.resolve())
  const timerRef = useRef<number | null>(null)
  // Each context owns its own mutable snapshot object. On a direct context
  // switch, the old effect cleanup therefore cannot accidentally persist the
  // new context's draft through the old context's API closure.
  const latestDraftRef = useMemo(() => ({ current: draft }), [contextId])
  const suppressFlushRef = useRef(false)
  const [status, setStatus] = useState<RecoveryStatus>("loading")
  restoreRef.current = input.onRestore
  latestDraftRef.current = draft

  const persist = useCallback((next: RecoverableCompositionDraft, rethrow = false) => {
    if (!enabled) return Promise.resolve()
    setStatus("saving")
    const operation = chainRef.current.then(async () => {
      try {
        if (!meaningfulDraft(next)) {
          if (versionRef.current !== null) {
            await originsApi.deleteCreatorDraft(context, versionRef.current)
            versionRef.current = null
          }
          setStatus("ready")
          return
        }
        const saved = await originsApi.saveCreatorDraft(context, next, versionRef.current)
        versionRef.current = saved.version
        setStatus("saved")
      } catch (reason) {
        const isConflict = reason instanceof Error && "status" in reason && (reason as Error & { status?: number }).status === 409
        setStatus(isConflict ? "conflict" : "error")
        if (rethrow) throw reason
      }
    })
    chainRef.current = operation.catch(() => undefined)
    return operation
  }, [context, enabled])

  useEffect(() => {
    if (!enabled) {
      readyRef.current = false
      versionRef.current = null
      setStatus("ready")
      return
    }
    let active = true
    readyRef.current = false
    versionRef.current = null
    setStatus("loading")
    const load = originsApi.creatorDraft(context).then((record) => {
      versionRef.current = record?.version ?? null
      if (!active) return
      if (record) {
        restoreRef.current(record.state)
        setStatus("saved")
      } else setStatus("ready")
      // Let React apply restored fields before autosave observes the draft.
      queueMicrotask(() => { if (active) readyRef.current = true })
    }).catch(() => {
      if (!active) return
      setStatus("error")
      readyRef.current = true
    })
    loadRef.current = load
    return () => { active = false }
  // Context identity is the owner. Object identity is intentionally ignored.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, enabled])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    const next = JSON.parse(serialized) as RecoverableCompositionDraft
    latestDraftRef.current = next
    suppressFlushRef.current = false
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void persist(next)
    }, 700)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  // serialized is the complete persistable state; contextId owns its location.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, enabled, persist, serialized])

  useEffect(() => () => {
    if (!enabled || suppressFlushRef.current) return
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    const next = latestDraftRef.current
    if (!meaningfulDraft(next)) return
    // A close, navigation or context switch must not cancel the last debounced
    // edit. Wait for discovery so an existing draft version is never guessed.
    void loadRef.current.then(() => persist(next))
  }, [contextId, enabled, persist])

  const saveNow = useCallback(async (next: RecoverableCompositionDraft = draft) => {
    if (!enabled) return
    suppressFlushRef.current = false
    latestDraftRef.current = next
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    await persist(next, true)
  }, [draft, enabled, persist])

  const clear = useCallback(async () => {
    if (!enabled) return
    suppressFlushRef.current = true
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    await loadRef.current
    await chainRef.current
    if (versionRef.current !== null) {
      await originsApi.deleteCreatorDraft(context, versionRef.current)
      versionRef.current = null
    }
    setStatus("ready")
  }, [context, enabled])

  const reload = useCallback(async () => {
    if (!enabled) return
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setStatus("loading")
    try {
      const record = await originsApi.creatorDraft(context)
      if (record) {
        versionRef.current = record.version
        restoreRef.current(record.state)
        setStatus("saved")
      } else {
        versionRef.current = null
        setStatus("ready")
      }
      readyRef.current = true
    } catch {
      setStatus("error")
    }
  }, [context, enabled])

  return { status, clear, saveNow, reload }
}
