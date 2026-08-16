import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { clipText } from "@/lib/format"
import { operationStatusLabel } from "@/lib/operation-language"
import type { ProductionPart } from "@/types/domain"

export type ProductionHealthIssue = { part: ProductionPart; title: string; detail: string; severity: "blocking" | "review" }

export function productionHealth(parts: ProductionPart[]) {
  return parts.filter((part) => part.kind !== "stitch" && part.enabled !== false).flatMap<ProductionHealthIssue>((part) => {
    const issues: ProductionHealthIssue[] = []
    if (part.kind === "draft" || (part.kind === "speech" && !part.clip_id)) issues.push({ part, title: "Speech not recorded", detail: "This Part has no active recording.", severity: "blocking" })
    if (part.missing) issues.push({ part, title: "Missing media", detail: "The selected source file is unavailable.", severity: "blocking" })
    if (part.outdated) issues.push({ part, title: "Recording outdated", detail: "The Part changed after this recording was generated.", severity: "review" })
    if (part.subtitles_stale) issues.push({ part, title: "Captions need review", detail: "Refresh captions after replacing the recording.", severity: "review" })
    if (part.speech_job && ["blocked", "failed", "lost", "cancelled"].includes(part.speech_job.status)) issues.push({ part, title: operationStatusLabel(part.speech_job.status, part.speech_job.result), detail: part.speech_job.error || part.speech_job.detail || "Review the durable operation.", severity: part.speech_job.status === "blocked" && part.speech_job.result?.requires_review ? "review" : "blocking" })
    return issues
  })
}

export function ProductionHealthSheet({ open, issues, onOpenChange, onLocate }: {
  open: boolean
  issues: ProductionHealthIssue[]
  onOpenChange: (open: boolean) => void
  onLocate: (id: number) => void
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="production-health-sheet"><SheetHeader><SheetTitle>Production health</SheetTitle><SheetDescription>Editorial and operation states that need attention before release.</SheetDescription></SheetHeader>
    <ProductionHealthContent issues={issues} onLocate={(id) => { onOpenChange(false); onLocate(id) }} />
  </SheetContent></Sheet>
}

export function ProductionHealthContent({ issues, onLocate }: { issues: ProductionHealthIssue[]; onLocate: (id: number) => void }) {
  const groups = Array.from(issues.reduce((result, issue) => {
    const current = result.get(issue.part.id) || { part: issue.part, issues: [] as ProductionHealthIssue[] }
    current.issues.push(issue)
    result.set(issue.part.id, current)
    return result
  }, new Map<number, { part: ProductionPart; issues: ProductionHealthIssue[] }>()).values())
  const blocking = issues.filter((issue) => issue.severity === "blocking").length
  const review = issues.length - blocking
  return <div className="production-health-content">{issues.length ? <>
    <header className="production-health-overview"><span className={blocking ? "is-blocking" : "is-clear"}>{blocking ? <CircleAlert /> : <CheckCircle2 />}</span><div><span className="eyebrow">Release queue</span><h3>{blocking ? `${blocking} blocking issue${blocking === 1 ? "" : "s"}` : "No blocking issues"}</h3><p>{review ? `${review} review state${review === 1 ? "" : "s"} remain visible but do not silently block export.` : "No additional review states."}</p></div><div className="production-health-counts"><span><b>{groups.length}</b> Parts</span><span><b>{issues.length}</b> states</span></div></header>
    <div className="production-health-list">{groups.map(({ part, issues: partIssues }) => <Button variant="ghost" key={part.id} onClick={() => onLocate(part.id)}><span className={partIssues.some((issue) => issue.severity === "blocking") ? "is-blocking" : "is-review"}><CircleAlert /></span><span><b>Part {String((part.position ?? 0) + 1).padStart(2, "0")}</b><small>{clipText(part.text || part.title || "Untitled", 100)}</small><span className="production-health-states">{partIssues.map((issue) => <em className={`is-${issue.severity}`} key={issue.title}>{issue.title}</em>)}</span></span><ArrowRight /></Button>)}</div>
  </> : <div className="production-health-clear"><CheckCircle2 /><b>No current Production issues</b><p>Every Part has usable current media and no unresolved editorial state.</p></div>}</div>
}
