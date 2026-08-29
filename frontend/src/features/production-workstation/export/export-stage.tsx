import type { ComponentProps } from "react"
import { CircleAlert, SlidersHorizontal, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import type { ProductionHealthIssue } from "@/features/production/production-health-sheet"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"

export function ReleaseInspector({ issues, staleOverrides, onLocate, onRemoveOverride }: {
  issues: ProductionHealthIssue[]
  staleOverrides: string[]
  onLocate: (id: number) => void
  onRemoveOverride: (partPublicId: string) => void
}) {
  const blocking = issues.filter((issue) => issue.severity === "blocking").length
  const review = issues.length - blocking + staleOverrides.length
  return <div className="ws-release-inspector">
    <section className={blocking ? "has-blockers" : review ? "has-review" : "is-clear"}><CircleAlert /><div><span className="ws-kicker">Release status</span><h3>{blocking ? `${blocking} blocking issue${blocking === 1 ? "" : "s"}` : review ? `${review} item${review === 1 ? "" : "s"} to review` : "Ready to export"}</h3><p>{blocking ? "Restore missing or broken media before making the final file." : review ? "These states do not silently block export, but remain explicit." : "No blocking audio issues remain."}</p></div></section>
    <div className="ws-release-issue-list">{issues.map((issue) => <button key={`${issue.part.id}:${issue.title}`} onClick={() => onLocate(issue.part.id)}><span>{formatPartNumber(issue.part.position ?? 0)}</span><div><b>{issue.title}</b><small>{formatAuthoredRole(issue.part.authored_role) || issue.detail}</small></div><i className={issue.severity} /></button>)}
      {staleOverrides.map((partPublicId) => <div className="ws-release-stale-override" key={partPublicId}><span><SlidersHorizontal /></span><div><b>Obsolete Script mix override</b><small>Its original Part no longer exists. It is not applied to another Part.</small></div><Button variant="ghost" size="sm" onClick={() => onRemoveOverride(partPublicId)}><Trash2 /> Remove</Button></div>)}
    </div>
  </div>
}

type ExportWorkspaceProps = ComponentProps<typeof MixExportWorkspace>

export function ExportDialog({ open, onOpenChange, issues, staleOverrides, onRemoveOverride, ...workspaceProps }: ExportWorkspaceProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  issues: ProductionHealthIssue[]
  staleOverrides: string[]
  onRemoveOverride: (partPublicId: string) => void
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="ws-export-dialog" aria-describedby="ws-export-description">
      <DialogHeader className="ws-export-dialog-header">
        <DialogTitle>Export {workspaceProps.production.name}</DialogTitle>
        <DialogDescription id="ws-export-description">Review the current Timeline, create an MP3 or MP4, and download saved files.</DialogDescription>
      </DialogHeader>
      <div className="ws-export-dialog-body">
        <main className="ws-export-dialog-main">
          <MixExportWorkspace {...workspaceProps} />
        </main>
        <aside className="ws-export-dialog-review" aria-label="Release checks">
          <header><span className="ws-kicker">Release checks</span><h2>Before delivery</h2></header>
          <ReleaseInspector
            issues={issues}
            staleOverrides={staleOverrides}
            onLocate={workspaceProps.onLocatePart}
            onRemoveOverride={onRemoveOverride}
          />
        </aside>
      </div>
    </DialogContent>
  </Dialog>
}
