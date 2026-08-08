import { LoaderCircle, Pause, Play } from "lucide-react"

import { MusicBed } from "@/components/music-bed"
import { ProductionTimeline } from "@/components/production-timeline"
import { Button } from "@/components/ui/button"
import { formatDuration, partDurationMs } from "@/lib/format"
import type { MusicBed as MusicBedType, PlayerSource, ProductionPart } from "@/types/domain"

export function TimingOverview({ parts, music, previewing, playingKey, playing, productionPlaying, productionCurrentTime, productionLoaded, onPreview, onLocate, onSeekProduction, onPlay, onMusicChange, onChooseMusic }: {
  parts: ProductionPart[]
  music: MusicBedType
  previewing: boolean
  playingKey?: string
  playing: boolean
  productionPlaying: boolean
  productionCurrentTime: number
  productionLoaded: boolean
  onPreview: () => void
  onLocate: (id: number) => void
  onSeekProduction: (seconds: number) => void
  onPlay: (source: PlayerSource) => void
  onMusicChange: (changes: Partial<MusicBedType>) => Promise<void>
  onChooseMusic: () => void
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const total = sourceParts.reduce((sum, part) => sum + partDurationMs(part), 0)
  return (
    <section className="production-controls" aria-label="Production playback and music">
      <header className="production-preview-row">
        <Button className="preview-main-action" size="icon" onClick={onPreview} disabled={previewing || sourceParts.length === 0} aria-label={productionPlaying ? "Pause full production" : "Play full production"}>
          {previewing ? <LoaderCircle className="spin" /> : productionPlaying ? <Pause /> : <Play />}
        </Button>
        <div>
          <span className="eyebrow">Full production</span>
          <h2>{previewing ? "Preparing the current mix…" : "Play voice, silences, assets, and music"}</h2>
          <p>{sourceParts.length} parts · {formatDuration(total / 1000)} · {music.filename ? `with ${music.name || "background music"}` : "narration only"}</p>
        </div>
        <Button variant="outline" onClick={onPreview} disabled={previewing || sourceParts.length === 0}>{previewing ? "Preparing…" : productionPlaying ? "Pause production" : "Play production"}</Button>
      </header>

      <ProductionTimeline parts={parts} music={music} playingKey={playingKey} currentTime={productionCurrentTime} productionLoaded={productionLoaded} onLocate={onLocate} onSeek={onSeekProduction} />

      <div className="production-music-controls">
        <MusicBed music={music} playingKey={playingKey} playing={playing} onPlay={onPlay} onChange={onMusicChange} onChoose={onChooseMusic} />
      </div>
    </section>
  )
}
