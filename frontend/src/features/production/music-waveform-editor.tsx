import { useEffect, useRef } from "react"
import WaveSurfer from "wavesurfer.js"

import { useAudioPeaks } from "@/components/audio-waveform"
import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"

export function MusicWaveformEditor({ url, duration, value, disabled, onChange, onCommit }: {
  url: string
  duration: number
  value: number
  disabled?: boolean
  onChange: (value: number) => void
  onCommit: (value: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const peaks = useAudioPeaks(url, 240)
  const boundedDuration = Math.max(duration, 0.1)
  const boundedValue = Math.min(Math.max(value, 0), boundedDuration)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !peaks?.length) return
    const color = window.getComputedStyle(container).color
    const waveform = WaveSurfer.create({
      container,
      peaks: [peaks],
      duration: boundedDuration,
      height: 96,
      waveColor: color,
      progressColor: color,
      cursorWidth: 0,
      interact: false,
      normalize: true,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      hideScrollbar: true,
    })
    return () => waveform.destroy()
  }, [boundedDuration, peaks])

  return <section className="music-waveform-editor" aria-label="Music source waveform">
    <header><span><b>Source start</b><small>Drag across the waveform to choose where the looping bed begins.</small></span><strong>{formatDuration(boundedValue)}</strong></header>
    <div className={`music-waveform-canvas${peaks?.length === 0 ? " is-unavailable" : ""}`}>
      <div className="music-waveform-surface" ref={containerRef} aria-hidden="true" />
      {!peaks && <span className="music-waveform-loading">Loading waveform…</span>}
      {peaks?.length === 0 && <span className="music-waveform-loading">Waveform unavailable · precise offset still works</span>}
      <Slider
        className="music-waveform-offset"
        aria-label="Music source position"
        disabled={disabled}
        value={[boundedValue]}
        max={boundedDuration}
        step={0.1}
        onValueChange={([next = 0]) => onChange(next)}
        onValueCommit={([next = boundedValue]) => onCommit(next)}
      />
    </div>
    <div className="music-waveform-ruler" aria-hidden="true"><span>0:00</span><span>{formatDuration(boundedDuration / 2)}</span><span>{formatDuration(boundedDuration)}</span></div>
  </section>
}
