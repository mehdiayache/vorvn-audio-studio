import { CheckCircle2, CircleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { clipText } from "@/lib/format"
import type { ProductionPart } from "@/types/domain"

export type ProductionHealthIssue = { part: ProductionPart; title: string; detail: string }

export function productionHealth(parts: ProductionPart[]) {
  return parts.filter((part) => part.kind !== "stitch").flatMap<ProductionHealthIssue>((part) => {
    const issues: ProductionHealthIssue[] = []
    if (part.kind === "draft" || (part.kind === "speech" && !part.selected_take_id)) issues.push({ part, title: "Speech not recorded", detail: "This Part has no selected Take." })
    if (part.missing) issues.push({ part, title: "Missing media", detail: "The selected source file is unavailable." })
    if (part.outdated) issues.push({ part, title: "Take outdated", detail: "The Part changed after this Take was generated." })
    if (part.subtitles_stale) issues.push({ part, title: "Captions stale", detail: "Refresh captions after the latest selected Take." })
    if (part.fidelity && part.fidelity.status !== "pass") issues.push({ part, title: "Wording review", detail: part.fidelity.message || "The provider result differs from the script." })
    if (part.speech_job && ["blocked", "failed", "lost", "cancelled"].includes(part.speech_job.status)) issues.push({ part, title: part.speech_job.status === "blocked" ? "Operation needs review" : "Generation failed", detail: part.speech_job.error || part.speech_job.detail || "Review the durable operation." })
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
    <div className="production-health-list">{issues.length ? issues.map((issue, index) => <Button variant="ghost" key={`${issue.part.id}:${issue.title}:${index}`} onClick={() => { onOpenChange(false); onLocate(issue.part.id) }}><CircleAlert /><span><b>{issue.title}</b><small>Part · {clipText(issue.part.text || issue.part.title || "Untitled", 80)}</small><small>{issue.detail}</small></span></Button>) : <div className="production-health-clear"><CheckCircle2 /><b>No current Production issues</b><p>All visible Parts have usable current results.</p></div>}</div>
  </SheetContent></Sheet>
}
