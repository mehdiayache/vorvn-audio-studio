import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import "./state-panel.css"

export function PageLoading({ label = "Loading Production" }: { label?: string }) {
  const subject = label.replace(/^Loading\s+/i, "")
  return (
    <main className="page-loading" aria-label={label} aria-live="polite" role="status">
      <header className="page-loading-header">
        <Skeleton className="page-loading-mark" />
        <div>
          <Skeleton className="page-loading-title" />
          <span><LoaderCircle className="spin" /> Opening {subject}…</span>
        </div>
      </header>
      <div className="page-loading-layout" aria-hidden="true">
        <aside>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </aside>
        <section>
          <Skeleton className="page-loading-section-title" />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </section>
      </div>
    </main>
  )
}

export function ErrorState({ title = "Production unavailable", message, retry }: { title?: string; message: string; retry: () => void }) {
  return (
    <main className="page-state state-centered" role="alert">
      <span className="state-icon error"><AlertCircle /></span>
      <div><h2>{title}</h2><p>{message}</p></div>
      <Button variant="outline" onClick={retry}><RefreshCw /> Try again</Button>
    </main>
  )
}

export function InlineResourceError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="inline-resource-error" role="status"><AlertCircle /><span>{message}</span><Button size="sm" variant="ghost" onClick={retry}><RefreshCw /> Retry</Button></div>
}

export function EmptySequence({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty-sequence">
      <span className="state-icon"><Inbox /></span>
      <div><h3>This Production is ready for its first part</h3><p>Add speech, a reusable intro, or intentional silence.</p></div>
      <Button onClick={onAdd}>Add speech</Button>
    </div>
  )
}
