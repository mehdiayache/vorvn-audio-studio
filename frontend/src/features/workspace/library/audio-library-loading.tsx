import { LoaderCircle } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"

export function AudioLibraryLoadingWorkspace({ label = "Loading Audio Library" }: { label?: string }) {
  return <section className="file-view file-library-view audio-library-loading" role="status" aria-live="polite" aria-label={label}>
    <div className="file-canvas"><div className="audio-library-card-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <Skeleton className="audio-library-card-skeleton" key={index} />)}
    </div></div>
    <aside className="file-inspector audio-library-inspector-loading" aria-hidden="true">
      <Skeleton className="audio-library-inspector-heading" />
      <Skeleton /><Skeleton /><Skeleton /><Skeleton />
    </aside>
    <span className="audio-library-loading-label"><LoaderCircle className="spin" />Loading your audio…</span>
  </section>
}
