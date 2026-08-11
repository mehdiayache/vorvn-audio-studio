import { useSyncExternalStore } from "react"

import { jobObserver } from "@/lib/job-observer"
import type { DurableJob } from "@/types/domain"

export function useJobExecution<T>(jobId: string | null) {
  return useSyncExternalStore(
    (listener) => jobObserver.subscribe(jobId, listener),
    () => jobObserver.getSnapshot<T>(jobId),
    () => null as DurableJob<T> | null,
  )
}
