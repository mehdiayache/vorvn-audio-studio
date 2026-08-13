import { Clock3 } from "lucide-react"

import { ProductionTimeline } from "@/components/production-timeline"
import { Badge } from "@/components/ui/badge"
import { formatDuration, partDurationMs } from "@/lib/format"
import type { MusicBed as MusicBedType, ProductionPart } from "@/types/domain"

export function TimingOverview({ parts, music, playingKey, productionCurrentTime, productionLoaded, onLocate, onSeekProduction }: {
  parts: ProductionPart[]
  music: MusicBedType
  playingKey?: string
  productionCurrentTime: number
  productionLoaded: boolean
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const total = sourceParts.reduce((sum, part) => sum + partDurationMs(part), 0)
  return (
    <section className="production-timing" aria-label="Production timing overview">
      <header className="production-timing-header">
        <span><Clock3 /></span>
        <div><span className="eyebrow">Read-only timing</span><h2>{sourceParts.length} Part{sourceParts.length === 1 ? "" : "s"} · {formatDuration(total / 1000)}</h2><p>{music.filename ? `Narration with ${music.name || "Music Bed"}` : "Narration only"} · use the Focus Bar to prepare or play the current mix.</p></div>
        <Badge variant="outline">{productionLoaded ? "Current preview loaded" : "Preview not loaded"}</Badge>
      </header>
      <ProductionTimeline parts={parts} music={music} playingKey={playingKey} currentTime={productionCurrentTime} productionLoaded={productionLoaded} onLocate={onLocate} onSeek={onSeekProduction} />
    </section>
  )
}
