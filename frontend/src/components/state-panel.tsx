import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import "./state-panel.css"

export function PageLoading({ label = "Loading Production" }: { label?: string }) {
  return (
    <main className="page-state" aria-label={label}>
      <div className="state-copy"><LoaderCircle className="spin" /> {label}…</div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
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
