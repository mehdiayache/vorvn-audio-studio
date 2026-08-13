import { AlertTriangle, CheckCircle2, CircleHelp, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { SpeechPartOperationFact } from "@/components/speech-part-card-model"

export function SpeechOperationLane({ operation, onRetry, onConfirm, onReviewTake }: {
  operation: SpeechPartOperationFact
  onRetry: () => void
  onConfirm: () => void
  onReviewTake: () => void
}) {
  if (operation.kind === "idle") return <div className="speech-operation-lane is-idle" aria-hidden="true" />
  const Icon = operation.kind === "active" ? LoaderCircle
    : operation.kind === "failed" ? AlertTriangle
      : operation.kind === "confirmation" || operation.kind === "review" ? CircleHelp
        : CheckCircle2
  return <section className={`speech-operation-lane is-${operation.kind}`} aria-live="polite" aria-atomic="true">
    <Icon className={operation.kind === "active" ? "spin" : ""} />
    <div className="speech-operation-copy">
      <b>{operation.label}</b>
      {operation.detail && <span>{operation.detail}</span>}
      {operation.progress !== null && <Progress value={operation.progress} aria-label={`${operation.label} ${operation.progress}%`} />}
    </div>
    <div className="speech-operation-actions">
      {operation.canConfirm && <Button size="sm" onClick={onConfirm}>Confirm and continue</Button>}
      {operation.canRetry && <Button size="sm" variant="outline" onClick={onRetry}><RotateCw /> Retry</Button>}
      {operation.canReviewTake && <Button size="sm" variant="outline" onClick={onReviewTake}>Review Take</Button>}
    </div>
  </section>
}
