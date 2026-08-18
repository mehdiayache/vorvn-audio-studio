import { useEffect, useRef } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js"

import { useAudioPeaks } from "@/components/audio-waveform"
import { formatDuration } from "@/lib/format"

export type MusicSourceWindow = { sourceOffsetMs: number; durationMs: number | null }

export function MusicWaveformEditor({ url, sourceDuration, sourceOffset, usedDuration, loop, disabled, onChange, onCommit }: {
  url: string
  sourceDuration: number
  sourceOffset: number
  usedDuration: number
  loop: boolean
  disabled?: boolean
  onChange: (window: MusicSourceWindow) => void
  onCommit: (window: MusicSourceWindow) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const regionRef = useRef<Region | null>(null)
  const syncing = useRef(false)
  const peaks = useAudioPeaks(url, 1024)
  const boundedSource = Math.max(sourceDuration, .1)
  const boundedOffset = Math.min(Math.max(sourceOffset, 0), Math.max(0, boundedSource - .1))
  const loopWindow = Math.min(Math.max(10, Math.min(30, usedDuration)), boundedSource - boundedOffset)
  const boundedUsed = Math.max(.1, Math.min(loop ? loopWindow : usedDuration, boundedSource - boundedOffset))

  useEffect(() => {
    const container = containerRef.current
    if (!container || !peaks?.length) return
    const regions = RegionsPlugin.create()
    const color = window.getComputedStyle(container).color
    const waveform = WaveSurfer.create({
      container,
      url,
      peaks: [peaks],
      duration: boundedSource,
      plugins: [regions],
      height: 112,
      waveColor: color,
      progressColor: color,
      cursorColor: "#6d28d9",
      cursorWidth: 1,
      interact: true,
      normalize: true,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      hideScrollbar: true,
    })
    const region = regions.addRegion({
      id: "music-source-window",
      start: boundedOffset,
      end: Math.min(boundedSource, boundedOffset + boundedUsed),
      drag: !disabled,
      resize: !disabled && !loop,
      minLength: .1,
      color: "rgba(109, 40, 217, .18)",
    })
    regionRef.current = region
    const value = (current: Region): MusicSourceWindow => ({
      sourceOffsetMs: Math.round(current.start * 1000),
      durationMs: loop ? null : Math.max(100, Math.round((current.end - current.start) * 1000)),
    })
    const stopUpdate = regions.on("region-update", (current) => {
      if (!syncing.current) onChange(value(current))
    })
    const stopUpdated = regions.on("region-updated", (current) => {
      if (!syncing.current) onCommit(value(current))
    })
    const stopClick = regions.on("region-clicked", (current, event) => {
      event.stopPropagation()
      current.play(true)
    })
    return () => {
      stopUpdate()
      stopUpdated()
      stopClick()
      regionRef.current = null
      waveform.destroy()
    }
  // Props are synchronized below without rebuilding the selected-source WaveSurfer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundedSource, disabled, loop, peaks, url])

  useEffect(() => {
    const region = regionRef.current
    if (!region) return
    const end = Math.min(boundedSource, boundedOffset + boundedUsed)
    if (Math.abs(region.start - boundedOffset) < .01 && Math.abs(region.end - end) < .01) return
    syncing.current = true
    region.setOptions({ start: boundedOffset, end })
    syncing.current = false
  }, [boundedOffset, boundedSource, boundedUsed])

  return <section className="music-waveform-editor" aria-label="Music source window">
    <header><span><b>{loop ? "Loop start" : "Used source window"}</b><small>{loop ? "Drag the highlighted window to choose where looping begins. Click it to audition." : "Drag the region; resize either edge to choose the exact source window."}</small></span><strong>{formatDuration(boundedOffset)} → {formatDuration(boundedOffset + boundedUsed)}</strong></header>
    <div className={`music-waveform-canvas${peaks?.length === 0 ? " is-unavailable" : ""}`}>
      <div className="music-waveform-surface" ref={containerRef} />
      {!peaks && <span className="music-waveform-loading">Loading waveform…</span>}
      {peaks?.length === 0 && <span className="music-waveform-loading">Waveform unavailable</span>}
    </div>
    <div className="music-waveform-ruler" aria-hidden="true"><span>0:00</span><span>{formatDuration(boundedSource / 2)}</span><span>{formatDuration(boundedSource)}</span></div>
  </section>
}
