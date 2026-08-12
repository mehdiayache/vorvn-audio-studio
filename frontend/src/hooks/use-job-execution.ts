import { useEffect, useSyncExternalStore } from "react"

import { studioApi } from "@/lib/api"
import { jobObserver } from "@/lib/job-observer"
import type { DurableJob } from "@/types/domain"

export function useJobExecution<T>(jobId: string | null) {
  const snapshot = useSyncExternalStore(
    (listener) => jobObserver.subscribe(jobId, listener),
    () => jobObserver.getSnapshot<T>(jobId),
    () => null as DurableJob<T> | null,
  )
  useEffect(() => {
    if (!jobId) return
    void jobObserver.observe<T>(jobId, studioApi.job<T>).catch(() => undefined)
  }, [jobId])
  return snapshot
}
