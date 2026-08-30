import { LoaderCircle } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"

export function AudioLibraryLoadingWorkspace({ label = "Loading Audio Library" }: { label?: string }) {
  return <section className="asset-view asset-library-view audio-library-loading" role="status" aria-live="polite" aria-label={label}>
    <div className="asset-canvas"><div className="audio-asset-card-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <Skeleton className="audio-asset-card-skeleton" key={index} />)}
    </div></div>
    <aside className="asset-inspector audio-library-inspector-loading" aria-hidden="true">
      <Skeleton className="audio-library-inspector-heading" />
      <Skeleton /><Skeleton /><Skeleton /><Skeleton />
    </aside>
    <span className="audio-library-loading-label"><LoaderCircle className="spin" />Loading your audio…</span>
  </section>
}
