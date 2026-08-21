import { useCallback, useRef, useState } from "react"

export function useAsyncAction<Action extends string>() {
  const activeActions = useRef(new Set<Action>())
  const [pendingActions, setPendingActions] = useState<ReadonlySet<Action>>(() => new Set())

  const updatePending = useCallback(() => {
    setPendingActions(new Set(activeActions.current))
  }, [])

  const run = useCallback(async <Result,>(action: Action, work: () => Promise<Result>): Promise<Result | undefined> => {
    if (activeActions.current.has(action)) return undefined
    activeActions.current.add(action)
    updatePending()
    try {
      return await work()
    } finally {
      activeActions.current.delete(action)
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
