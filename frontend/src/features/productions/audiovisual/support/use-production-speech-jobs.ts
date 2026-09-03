import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { originsApi } from "@/lib/api"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import { jobObserver } from "@/lib/job-observer"
import type { DurableJob, GenerateResult, ProductionPart } from "@/types/domain"

const activeStatuses = new Set(["queued", "running", "retrying"])

/**
 * Keeps the durable Jobs already attached to server Parts live in the UI.
 * This deliberately owns no task/card state: the Production document remains
 * the source of Part identity and the Job observer only productions execution.
 */
export function useProductionSpeechJobs(parts: ProductionPart[], refresh: () => Promise<void>) {
  const jobs = useMemo(() => parts.flatMap((part) => [
    part.speech_job ? { job: part.speech_job as DurableJob<GenerateResult>, kind: "speech" as const, part } : null,
    part.caption_job ? { job: part.caption_job as DurableJob<unknown>, kind: "caption" as const, part } : null,
  ].filter(Boolean) as Array<{ job: DurableJob<unknown>; kind: "speech" | "caption"; part: ProductionPart }>), [parts])
  const jobKey = jobs.map(({ job }) => `${job.id}:${job.status}`).join("|")
  const [live, setLive] = useState<Record<string, DurableJob<unknown>>>({})
  const reportedSpeechJobs = useRef(new Set<string>())

  useEffect(() => {
    const unsubscribers: Array<() => void> = []
    let active = true
    for (const { job, kind, part } of jobs) {
      const announceCompletion = kind === "speech" && activeStatuses.has(job.status)
      jobObserver.register(job, originsApi.job<unknown>)
      const sync = () => {
        const snapshot = jobObserver.getSnapshot<unknown>(job.id)
        if (!snapshot || !active) return
        setLive((current) => current[job.id] === snapshot ? current : { ...current, [job.id]: snapshot })
      }
      unsubscribers.push(jobObserver.subscribe(job.id, sync))
      sync()
      void jobObserver.completion<unknown>(job.id)
        .then(() => {
          const completed = jobObserver.getSnapshot<GenerateResult>(job.id)
          if (!active || !announceCompletion || !completed || !["ok", "warning"].includes(completed.status) || reportedSpeechJobs.current.has(job.id)) return
          reportedSpeechJobs.current.add(job.id)
          const role = formatAuthoredRole(part.authored_role) || part.voice_name || part.voice || "Speech"
          toast.success("Recording ready", { description: `Part ${formatPartNumber(part.position ?? 0)} · ${role}` })
        })
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
