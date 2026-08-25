import { Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js"

import { useAudioPeaks } from "@/components/audio-waveform"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/format"

import "./music-source-editor.css"

export type AudioSourceWindow = { sourceOffsetMs: number; durationMs: number | null }

export function AudioSourceEditor({ url, peaksUrl, sourceDuration, sourceOffset, usedDuration, loop, disabled, audition = false, minimumDuration = .1, maximumDuration, onChange, onCommit }: {
  url: string
  peaksUrl?: string
  sourceDuration: number
  sourceOffset: number
  usedDuration: number
  loop: boolean
  disabled?: boolean
  audition?: boolean
  minimumDuration?: number
  maximumDuration?: number
  onChange: (window: AudioSourceWindow) => void
  onCommit: (window: AudioSourceWindow) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const waveformRef = useRef<WaveSurfer | null>(null)
  const regionRef = useRef<Region | null>(null)
  const syncing = useRef(false)
  const gestureDirty = useRef(false)
  const lastWindow = useRef<AudioSourceWindow>({ sourceOffsetMs: sourceOffset * 1000, durationMs: loop ? null : usedDuration * 1000 })
  const callbacks = useRef({ onChange, onCommit })
  const interaction = useRef({ disabled: Boolean(disabled), loop, minimumDuration, maximumDuration })
  const [playing, setPlaying] = useState(false)
  callbacks.current = { onChange, onCommit }
  interaction.current = { disabled: Boolean(disabled), loop, minimumDuration, maximumDuration }
  const peaks = useAudioPeaks(url, 1024, peaksUrl)
  const boundedSource = Math.max(sourceDuration, .1)
  const boundedMinimum = Math.max(.1, Math.min(minimumDuration, boundedSource))
  const boundedMaximum = Math.max(boundedMinimum, Math.min(maximumDuration ?? boundedSource, boundedSource))
  const boundedOffset = Math.min(Math.max(sourceOffset, 0), Math.max(0, boundedSource - boundedMinimum))
  const boundedUsed = Math.max(boundedMinimum, Math.min(loop ? .1 : usedDuration, boundedMaximum, boundedSource - boundedOffset))
  const desiredRegion = useRef({ start: boundedOffset, end: Math.min(boundedSource, boundedOffset + boundedUsed) })
  desiredRegion.current = { start: boundedOffset, end: Math.min(boundedSource, boundedOffset + boundedUsed) }

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
    waveformRef.current = waveform
    const value = (current: Region): AudioSourceWindow => ({
      sourceOffsetMs: Math.round(current.start * 1000),
      durationMs: interaction.current.loop ? null : Math.max(100, Math.round((current.end - current.start) * 1000)),
    })
    const changed = (next: AudioSourceWindow) =>
      next.sourceOffsetMs !== lastWindow.current.sourceOffsetMs || next.durationMs !== lastWindow.current.durationMs
    const stopUpdate = regions.on("region-update", (current) => {
      if (syncing.current) return
      const next = value(current)
      if (!changed(next)) return
      gestureDirty.current = true
      lastWindow.current = next
      callbacks.current.onChange(next)
    })
    const stopUpdated = regions.on("region-updated", (current) => {
      if (syncing.current || !gestureDirty.current) return
      const next = value(current)
      gestureDirty.current = false
      lastWindow.current = next
      callbacks.current.onCommit(next)
    })
    const stopClick = regions.on("region-clicked", (_current, event) => {
      event.stopPropagation()
    })
    const stopPlay = waveform.on("play", () => setPlaying(true))
    const stopPause = waveform.on("pause", () => setPlaying(false))
    const stopFinish = waveform.on("finish", () => setPlaying(false))
    const stopReady = waveform.once("ready", () => {
      const desired = desiredRegion.current
      regionRef.current = regions.addRegion({
        id: "audio-source-window",
        start: desired.start,
        end: desired.end,
        drag: !interaction.current.disabled,
        resize: !interaction.current.disabled && !interaction.current.loop,
        minLength: Math.min(interaction.current.minimumDuration, boundedSource),
        maxLength: Math.min(interaction.current.maximumDuration ?? boundedSource, boundedSource),
        color: "rgba(109, 40, 217, .18)",
      })
    })
    return () => {
      stopUpdate()
      stopUpdated()
      stopClick()
      stopPlay()
      stopPause()
      stopFinish()
      stopReady()
      regionRef.current = null
      waveformRef.current = null
      waveform.destroy()
    }
  // Props are synchronized below without rebuilding the selected-source WaveSurfer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundedSource, peaks, url])

  useEffect(() => {
    const region = regionRef.current
    if (!region) return
    const end = Math.min(boundedSource, boundedOffset + boundedUsed)
    const desired = {
      sourceOffsetMs: Math.round(boundedOffset * 1000),
      durationMs: loop ? null : Math.max(100, Math.round((end - boundedOffset) * 1000)),
    }
    if (!gestureDirty.current) lastWindow.current = desired
    syncing.current = true
    region.minLength = boundedMinimum
    region.maxLength = boundedMaximum
    region.setOptions({
      start: boundedOffset,
      end,
      drag: !disabled,
      resize: !disabled && !loop,
    })
    syncing.current = false
  }, [boundedMaximum, boundedMinimum, boundedOffset, boundedSource, boundedUsed, disabled, loop])

  async function toggleAudition() {
    const waveform = waveformRef.current
    const region = regionRef.current
    if (!waveform || !region || disabled) return
    if (playing) {
      waveform.pause()
      return
    }
    await waveform.play(region.start, region.end)
  }

  return <section className={`music-waveform-editor${loop ? " is-loop" : ""}`} aria-label="Audio source window">
    <header className="music-waveform-header">
      <span className="music-waveform-heading"><b>{loop ? "Source start" : "Selected passage"}</b><small>{loop ? "First pass starts here; repeats restart at 0:00." : "Drag the passage to move it. Resize either edge to change its length."}</small></span>
      <span className="music-waveform-selection"><small>{loop ? "Starts at" : "Selection"}</small><strong>{loop ? formatDuration(boundedOffset) : `${formatDuration(boundedOffset)}–${formatDuration(boundedOffset + boundedUsed)}`}</strong>{!loop && <em>{formatDuration(boundedUsed)} selected</em>}</span>
      {audition && <Button type="button" variant="outline" size="sm" disabled={disabled || !peaks?.length} onClick={() => void toggleAudition()}>{playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play selection"}</Button>}
    </header>
    <div className={`music-waveform-canvas${peaks?.length === 0 ? " is-unavailable" : ""}`}>
      <div className="music-waveform-surface" ref={containerRef} />
      {!peaks && <span className="music-waveform-loading">Loading waveform…</span>}
      {peaks?.length === 0 && <span className="music-waveform-loading">Waveform unavailable</span>}
    </div>
    <div className="music-waveform-ruler" aria-hidden="true"><span>0:00</span><span>{formatDuration(boundedSource / 2)}</span><span>{formatDuration(boundedSource)}</span></div>
  </section>
}
