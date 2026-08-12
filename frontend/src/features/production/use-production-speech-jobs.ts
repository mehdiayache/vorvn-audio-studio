import { useEffect, useMemo, useState } from "react"

import { studioApi } from "@/lib/api"
import { jobObserver } from "@/lib/job-observer"
import type { DurableJob, GenerateResult, ProductionPart } from "@/types/domain"

/**
 * Keeps the durable Jobs already attached to server Parts live in the UI.
 * This deliberately owns no task/card state: the Production document remains
 * the source of Part identity and the Job observer only projects execution.
 */
export function useProductionSpeechJobs(parts: ProductionPart[], refresh: () => Promise<void>) {
  const jobs = useMemo(() => parts.flatMap((part) => part.speech_job ? [part.speech_job] : []), [parts])
  const jobKey = jobs.map((job) => `${job.id}:${job.status}`).join("|")
  const [live, setLive] = useState<Record<string, DurableJob<GenerateResult>>>({})

  useEffect(() => {
    const unsubscribers: Array<() => void> = []
    let active = true
    for (const job of jobs) {
      jobObserver.register(job, studioApi.job<GenerateResult>)
      const sync = () => {
        const snapshot = jobObserver.getSnapshot<GenerateResult>(job.id)
        if (!snapshot || !active) return
        setLive((current) => current[job.id] === snapshot ? current : { ...current, [job.id]: snapshot })
      }
      unsubscribers.push(jobObserver.subscribe(job.id, sync))
      sync()
      void jobObserver.completion<GenerateResult>(job.id)
        .catch(() => undefined)
        .finally(() => { if (active) void refresh().catch(() => undefined) })
    }
    return () => {
      active = false
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  // The status key prevents a refreshed Production document from rebuilding
  // subscriptions merely because unrelated Part fields changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey, refresh])

  return live
}
