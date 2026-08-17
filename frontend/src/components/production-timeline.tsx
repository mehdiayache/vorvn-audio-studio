import { Mic2, Minus, Music2, Plus, Volume2 } from "lucide-react"
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react"

import { AudioWaveform } from "@/components/audio-waveform"
import { Button } from "@/components/ui/button"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { buildProductionTiming, type ProductionTimingSpan } from "@/lib/production-timing"
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

function spanStyle(span: ProductionTimingSpan, total: number) {
  return {
    left: `${(span.start / total) * 100}%`,
    width: `${(span.duration / total) * 100}%`,
  }
}

function partLabel(span: ProductionTimingSpan) {
  if (span.part.kind === "silence") return `Silence ${span.duration.toFixed(1)}s`
  if (span.lane === "sfx") return span.part.title || span.part.asset_collection || "Venture audio"
  return span.part.authored_role || span.part.voice_name || span.part.voice || "Voice"
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
  const timing = useMemo(() => buildProductionTiming(parts), [parts])
  const total = Math.max(.01, timing.total)
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

  function seekWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!productionLoaded || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") return onSeek(0)
    if (event.key === "End") return onSeek(timing.total)
    onSeek(Math.min(timing.total, Math.max(0, currentTime + (event.key === "ArrowRight" ? 5 : -5))))
  }

  function clips(spans: ProductionTimingSpan[]) {
    return spans.map((span) => (
      <button
        key={span.part.id}
        style={spanStyle(span, total)}
        className={cn("timeline-clip", span.part.kind, playingKey === `part:${span.part.id}` && "active")}
        onClick={(event) => { event.stopPropagation(); onLocate(span.part.id) }}
        title={`${span.number}. ${span.lane === "sfx" ? "SFX" : span.part.kind} · ${formatDuration(span.duration)} · ${partLabel(span)}`}
        aria-label={`Locate part ${span.number}, ${span.lane === "sfx" ? "SFX" : span.part.kind}, ${formatDuration(span.duration)}`}
      >
        {span.part.filename && span.part.kind !== "silence" && <AudioWaveform url={audioUrl(span.part.filename)} bars={32} />}
        <span><b>{span.number}</b><em>{partLabel(span)}</em></span>
      </button>
    ))
  }

  const narration = timing.spans.filter((span) => span.lane === "narration")
  const musicFacts = music.filename
    ? `${music.name || "Music bed"} · source +${formatDuration(Number(music.start || 0))} · ${Math.round(Number(music.volume || 0) * 100)}% · ${music.duck ? "ducking on" : "ducking off"}`
    : "No music attached"

  return (
    <section className="timeline-shell" aria-label="Production timeline">
      <header className="timeline-toolbar">
        <div><span className="eyebrow">Production time · {formatDuration(timing.total)}</span><h3>Narration, SFX and music</h3></div>
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
          <div className="timeline-lanes">
            <div className="timeline-lane-row narration">
              <span className="timeline-lane-label"><Mic2 /> Narration</span>
              <div className={cn("timeline-track", productionLoaded && "seekable")} onClick={seek} onKeyDown={seekWithKeyboard} role="slider" tabIndex={productionLoaded ? 0 : -1} aria-label="Production position" aria-disabled={!productionLoaded} aria-valuemin={0} aria-valuemax={timing.total} aria-valuenow={Math.min(timing.total, currentTime)} aria-valuetext={`${formatDuration(Math.min(timing.total, currentTime))} of ${formatDuration(timing.total)}`}>
                {clips(narration)}
                {!narration.length && <span className="timeline-empty">No timed narration</span>}
              </div>
            </div>
            <div className="timeline-lane-row sfx">
              <span className="timeline-lane-label"><Volume2 /> SFX</span>
              <div className={cn("timeline-track", "sfx-track", productionLoaded && "seekable")} onClick={seek}>
                {clips(timing.sfx)}
                {!timing.sfx.length && <span className="timeline-empty">No SFX or linked Venture audio</span>}
              </div>
            </div>
            <div className="timeline-lane-row music">
              <span className="timeline-lane-label"><Music2 /> Music</span>
              <div className={cn("timeline-track", "music-track", productionLoaded && "seekable")} onClick={seek}>
                {music.filename ? <div className="timeline-music-clip"><AudioWaveform url={audioUrl(music.filename)} bars={72} /><span>{musicFacts}</span></div> : <span className="timeline-empty">{musicFacts}</span>}
              </div>
            </div>
            {productionLoaded && <i className="timeline-playhead" style={{ left: `${playhead}%` }} aria-hidden="true" />}
          </div>
        </div>
      </div>
      <p className="timeline-hint">{timing.untimed.length ? `${timing.untimed.length} Draft${timing.untimed.length === 1 ? " has" : "s have"} no audio yet and consume${timing.untimed.length === 1 ? "s" : ""} no timeline time. ` : ""}{productionLoaded ? "Click any lane to seek the current preview." : "Play the full Production to activate its playhead and seeking."}</p>
    </section>
  )
}
