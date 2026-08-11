import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { studioApi } from "@/lib/api"
import { contextWire, meaningfulDraft } from "@/lib/composer-draft-persistence"
import type { CompositionContext, RecoverableCompositionDraft } from "@/lib/composer-contract"

type RecoveryStatus = "loading" | "ready" | "saving" | "saved" | "conflict" | "error"

export function useComposerDraftRecovery(input: {
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
  const timerRef = useRef<number | null>(null)
  const [status, setStatus] = useState<RecoveryStatus>("loading")
  restoreRef.current = input.onRestore

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
    void studioApi.composerDraft(context).then((record) => {
      if (!active) return
      if (record) {
        versionRef.current = record.version
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
    return () => { active = false }
  // Context identity is the owner. Object identity is intentionally ignored.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, enabled])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    const next = JSON.parse(serialized) as RecoverableCompositionDraft
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setStatus("saving")
      chainRef.current = chainRef.current.then(async () => {
        try {
          if (!meaningfulDraft(next)) {
            if (versionRef.current !== null) {
              await studioApi.deleteComposerDraft(context, versionRef.current)
              versionRef.current = null
            }
            setStatus("ready")
            return
          }
          const saved = await studioApi.saveComposerDraft(context, next, versionRef.current)
          versionRef.current = saved.version
          setStatus("saved")
        } catch (reason) {
          const isConflict = reason instanceof Error && "status" in reason && (reason as Error & { status?: number }).status === 409
          setStatus(isConflict ? "conflict" : "error")
        }
      })
    }, 700)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  // serialized is the complete persistable state; contextId owns its location.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, enabled, serialized])

  const clear = useCallback(async () => {
    if (!enabled) return
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    await chainRef.current
    if (versionRef.current !== null) {
      await studioApi.deleteComposerDraft(context, versionRef.current)
      versionRef.current = null
    }
    setStatus("ready")
  }, [context, enabled])

  return { status, clear }
}
