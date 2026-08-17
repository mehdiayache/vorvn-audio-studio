import { Clock3, LoaderCircle, X } from "lucide-react"

import { ProductionTimeline } from "@/components/production-timeline"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/format"
import { buildProductionTiming } from "@/lib/production-timing"
import type { MusicBed as MusicBedType, ProductionPart } from "@/types/domain"

export function TimingOverview({ parts, music, playingKey, previewing = false, productionCurrentTime, productionLoaded, onLocate, onSeekProduction, onClose }: {
  parts: ProductionPart[]
  music: MusicBedType
  playingKey?: string
  previewing?: boolean
  productionCurrentTime: number
  productionLoaded: boolean
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onClose?: () => void
}) {
  const timing = buildProductionTiming(parts)
  const musicLabel = music.filename ? music.name || "Music attached" : "No music"
  return (
    <section className="production-timing" aria-label="Production timing overview">
      <header className="production-timing-header">
        <span><Clock3 /></span>
        <div><span className="eyebrow">Read-only timing</span><h2>{formatDuration(timing.total)} · {timing.narration.length} voice · {timing.sfx.length} SFX</h2><p>{timing.silences.length} deliberate pause{timing.silences.length === 1 ? "" : "s"} · {musicLabel} · click a clip to find its Part in Sequence.</p></div>
        <div className="production-timing-actions">{timing.untimed.length > 0 && <Badge variant="outline">{timing.untimed.length} not timed</Badge>}<Badge className={`timing-preview-state${previewing ? " is-preparing" : productionLoaded ? " is-ready" : ""}`} variant="outline">{previewing && <LoaderCircle className="animate-spin" />}{previewing ? "Preparing preview…" : productionLoaded ? "Preview ready" : "Preview not loaded"}</Badge>{onClose && <Button variant="ghost" size="icon-sm" aria-label="Close Timing" onClick={onClose}><X /></Button>}</div>
      </header>
      <ProductionTimeline parts={parts} music={music} playingKey={playingKey} currentTime={productionCurrentTime} productionLoaded={productionLoaded} onLocate={onLocate} onSeek={onSeekProduction} />
    </section>
  )
}
