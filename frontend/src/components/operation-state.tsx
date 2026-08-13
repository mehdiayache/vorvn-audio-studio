import { AlertTriangle, CheckCircle2, CircleHelp, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { DurableJob } from "@/types/domain"
import { durableOperationTruth } from "@/lib/operation-language"

import "./operation-state.css"

export function operationStateLabel(job: DurableJob<unknown>) {
  return durableOperationTruth(job).label
}

export function OperationState<T>({ job, title, onConfirm, onRetry, onDismiss }: {
  job: DurableJob<T>
  title?: string
  onConfirm?: () => void
  onRetry?: () => void
  onDismiss?: () => void
}) {
  const { active, failed, review, confirmation, detail } = durableOperationTruth(job as DurableJob<unknown>)
  const Icon = active ? LoaderCircle : failed ? AlertTriangle : review || confirmation ? CircleHelp : CheckCircle2
  return <section className={`operation-state operation-${job.status}`} aria-live="polite" aria-atomic="true">
    <Icon className={active ? "spin" : ""} />
    <div>
      <small>{operationStateLabel(job)}</small>
      <h3>{title || job.type}</h3>
      {detail && <p>{detail}</p>}
      {active && <Progress value={Math.max(0, Math.min(100, Number(job.progress || 0)))} aria-label={`${operationStateLabel(job)} ${Math.round(Number(job.progress || 0))}%`} />}
      <code>{job.id}</code>
    </div>
    <div className="operation-state-actions">
      {confirmation && onConfirm && <Button onClick={onConfirm}>Confirm ${Number((job.result as { estimate?: number; estimated_cost?: number })?.estimate || (job.result as { estimated_cost?: number })?.estimated_cost || 0).toFixed(4)} and continue</Button>}
      {failed && onRetry && <Button variant="outline" onClick={onRetry}><RotateCw /> Retry</Button>}
      {!active && onDismiss && <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>}
    </div>
  </section>
}
