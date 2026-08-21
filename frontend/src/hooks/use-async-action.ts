import { useCallback, useRef, useState } from "react"

export function useAsyncAction<Action extends string>() {
  const activeActions = useRef(new Map<Action, Promise<unknown>>())
  const [pendingActions, setPendingActions] = useState<ReadonlySet<Action>>(() => new Set())

  const updatePending = useCallback(() => {
    setPendingActions(new Set(activeActions.current.keys()))
  }, [])

  const run = useCallback(async <Result,>(action: Action, work: () => Promise<Result>): Promise<Result> => {
    const current = activeActions.current.get(action)
    if (current) return current as Promise<Result>
    const execution = work()
    activeActions.current.set(action, execution)
    updatePending()
    try {
      return await execution
    } finally {
      if (activeActions.current.get(action) === execution) activeActions.current.delete(action)
      updatePending()
    }
  }, [updatePending])

  const isPending = useCallback((action: Action) => pendingActions.has(action), [pendingActions])

  return {
    run,
    isPending,
    pendingActions,
    busy: pendingActions.size > 0,
  }
}
