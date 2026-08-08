import { Minus, Music2, Plus } from "lucide-react"
import { useMemo, useState, type MouseEvent } from "react"

import { AudioWaveform } from "@/components/audio-waveform"
import { Button } from "@/components/ui/button"
import { audioUrl } from "@/lib/api"
import { formatDuration, partDurationMs } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { MusicBed, ProductionPart } from "@/types/domain"

import "@/components/production-timeline.css"

const ZOOM_LEVELS = [0, 1, 2, 4] as const

function markStep(totalSeconds: number, zoom: number) {
  if (!zoom) return Math.max(1, Math.ceil(totalSeconds / 4))
  if (zoom >= 4) return 5
  if (zoom >= 2) return 10
  return totalSeconds > 180 ? 30 : 15
}

export function ProductionTimeline({ parts, music, playingKey, currentTime, productionLoaded, onLocate, onSeek }: {
  parts: ProductionPart[]
  music: MusicBed
  playingKey?: string
  currentTime: number
  productionLoaded: boolean
  onLocate: (id: number) => void
  onSeek: (seconds: number) => void
}) {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const durations = sourceParts.map((part) => Math.max(partDurationMs(part) / 1000, part.kind === "draft" ? .5 : .25))
  const total = Math.max(.01, durations.reduce((sum, duration) => sum + duration, 0))
  const [zoomIndex, setZoomIndex] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIndex] ?? 0
  const ticks = useMemo(() => {
    const step = markStep(total, zoom)
    const values = Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step)
    if (values.at(-1) !== total) values.push(total)
    return values
  }, [total, zoom])
  const width = zoom ? Math.max(760, total * 12 * zoom) : undefined
  const playhead = Math.min(100, Math.max(0, (currentTime / total) * 100))

  function seek(event: MouseEvent<HTMLDivElement>) {
    if (!productionLoaded) return
    const bounds = event.currentTarget.getBoundingClientRect()
    onSeek(((event.clientX - bounds.left) / bounds.width) * total)
  }

  return (
    <section className="timeline-shell" aria-label="Production timeline">
      <header className="timeline-toolbar">
        <div><span className="eyebrow">Mix overview</span><h3>Voice and music timing</h3></div>
        <div className="timeline-zoom" aria-label="Timeline zoom">
          <Button variant="ghost" size="icon" onClick={() => setZoomIndex((value) => Math.max(0, value - 1))} disabled={zoomIndex === 0} aria-label="Zoom out"><Minus /></Button>
          <span>{zoom ? `${zoom}×` : "Fit"}</span>
          <Button variant="ghost" size="icon" onClick={() => setZoomIndex((value) => Math.min(ZOOM_LEVELS.length - 1, value + 1))} disabled={zoomIndex === ZOOM_LEVELS.length - 1} aria-label="Zoom in"><Plus /></Button>
        </div>
      </header>
      <div className="timeline-scroll">
        <div className="timeline-canvas" style={{ width }}>
          <div className="timeline-ruler" aria-hidden="true">
            {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / total) * 100}%` }}><i />{formatDuration(tick)}</span>)}
          </div>
          <div className="timeline-lane-row">
            <span className="timeline-lane-label">Sequence</span>
            <div className={cn("timeline-track", productionLoaded && "seekable")} onClick={seek}>
              {sourceParts.map((part, index) => (
                <button key={part.id} style={{ width: `${((durations[index] ?? .25) / total) * 100}%` }} className={cn("timeline-clip", part.kind, playingKey === `part:${part.id}` && "active")} onClick={(event) => { event.stopPropagation(); onLocate(part.id) }} title={`${index + 1}. ${part.kind} · ${formatDuration(durations[index] ?? .25)}`}>
                  {part.filename && part.kind !== "silence" && <AudioWaveform url={audioUrl(part.filename)} bars={32} />}
                  <span>{part.kind === "silence" ? `${durations[index] ?? .25}s` : index + 1}</span>
                </button>
              ))}
              {productionLoaded && <i className="timeline-playhead" style={{ left: `${playhead}%` }} aria-hidden="true" />}
            </div>
          </div>
          <div className="timeline-lane-row music">
            <span className="timeline-lane-label"><Music2 /> Music</span>
            <div className="timeline-track music-track">
              {music.filename ? <div className="timeline-music-clip"><AudioWaveform url={audioUrl(music.filename)} bars={72} /><span>{music.name || "Music bed"} · source at {formatDuration(music.start || 0)} · loops to fit</span></div> : <span className="timeline-empty">No music — narration only</span>}
            </div>
          </div>
        </div>
      </div>
      <p className="timeline-hint">{productionLoaded ? "Click the sequence lane to seek the full production." : "Play the full production to activate its playhead and seeking."}</p>
    </section>
  )
}
