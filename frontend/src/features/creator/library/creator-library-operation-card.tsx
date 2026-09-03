import { AlertTriangle, LoaderCircle, Sparkles } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import type { CreatorLibraryCreationItem } from "./creator-library-creation-item"
import "./creator-library-operation-card.css"

export function CreatorLibraryOperationCard({ label, detail, status = "generating", progress }: {
  label: string
  detail?: string
  status?: CreatorLibraryCreationItem["status"]
  progress?: number
}) {
  const failed = status === "failed" || status === "canceled"
  return <article className={cn("creator-library-operation-card", failed && "is-failed")} data-status={status} aria-live="polite">
    <span className="creator-library-operation-icon">{failed ? <AlertTriangle /> : status === "ready" ? <Sparkles /> : <LoaderCircle className="is-spinning" />}</span>
    <div><b>{label}</b><small>{detail || (failed ? "Creation did not finish" : status === "queued" ? "Waiting to start…" : "Creating…")}</small></div>
    {typeof progress === "number" && !failed && <Progress value={Math.max(0, Math.min(100, progress))} />}
  </article>
}
