import { AlertTriangle, CheckCircle2, CircleHelp, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { DurableJob } from "@/types/domain"
import { operatorErrorMessage, operationStatusLabel } from "@/lib/operation-language"

import "./operation-state.css"

const activeStatuses = new Set(["queued", "running", "retrying"])
const failedStatuses = new Set(["failed", "lost", "cancelled"])

export function operationStateLabel(job: DurableJob<unknown>) {
  return operationStatusLabel(job.status, job.result as { requires_review?: boolean; ambiguous?: boolean; needs_confirmation?: boolean })
}

export function OperationState<T>({ job, title, onConfirm, onRetry, onDismiss }: {
  job: DurableJob<T>
  title?: string
  onConfirm?: () => void
  onRetry?: () => void
  onDismiss?: () => void
}) {
  const active = activeStatuses.has(job.status)
  const failed = failedStatuses.has(job.status)
  const review = job.status === "blocked" && Boolean((job.result as { requires_review?: boolean; ambiguous?: boolean })?.requires_review || (job.result as { ambiguous?: boolean })?.ambiguous)
  const confirmation = job.status === "blocked" && !review && Boolean((job.result as { needs_confirmation?: boolean })?.needs_confirmation)
  const Icon = active ? LoaderCircle : failed ? AlertTriangle : review || confirmation ? CircleHelp : CheckCircle2
  const detail = failed ? operatorErrorMessage(job.error || job.detail) : job.detail
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
      {confirmation && onConfirm && <Button onClick={onConfirm}>Confirm and continue</Button>}
      {failed && onRetry && <Button variant="outline" onClick={onRetry}><RotateCw /> Retry</Button>}
      {!active && onDismiss && <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>}
    </div>
  </section>
}
