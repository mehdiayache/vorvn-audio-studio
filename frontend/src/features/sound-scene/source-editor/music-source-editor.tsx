import { useEffect, useRef } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js"

import { useAudioPeaks } from "@/components/audio-waveform"
import { formatDuration } from "@/lib/format"

export type MusicSourceWindow = { sourceOffsetMs: number; durationMs: number | null }

export function MusicSourceEditor({ url, sourceDuration, sourceOffset, usedDuration, loop, disabled, onChange, onCommit }: {
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
  const gestureDirty = useRef(false)
  const lastWindow = useRef<MusicSourceWindow>({ sourceOffsetMs: sourceOffset * 1000, durationMs: loop ? null : usedDuration * 1000 })
  const callbacks = useRef({ onChange, onCommit })
  const interaction = useRef({ disabled: Boolean(disabled), loop })
  callbacks.current = { onChange, onCommit }
  interaction.current = { disabled: Boolean(disabled), loop }
  const peaks = useAudioPeaks(url, 1024)
  const boundedSource = Math.max(sourceDuration, .1)
  const boundedOffset = Math.min(Math.max(sourceOffset, 0), Math.max(0, boundedSource - .1))
  const boundedUsed = Math.max(.1, Math.min(loop ? .1 : usedDuration, boundedSource - boundedOffset))
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
    const value = (current: Region): MusicSourceWindow => ({
      sourceOffsetMs: Math.round(current.start * 1000),
      durationMs: interaction.current.loop ? null : Math.max(100, Math.round((current.end - current.start) * 1000)),
    })
    const changed = (next: MusicSourceWindow) =>
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
    const stopReady = waveform.once("ready", () => {
      const desired = desiredRegion.current
      regionRef.current = regions.addRegion({
        id: "music-source-window",
        start: desired.start,
        end: desired.end,
        drag: !interaction.current.disabled,
        resize: !interaction.current.disabled && !interaction.current.loop,
        minLength: .1,
        color: "rgba(109, 40, 217, .18)",
      })
    })
    return () => {
      stopUpdate()
      stopUpdated()
      stopClick()
      stopReady()
      regionRef.current = null
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
    region.setOptions({
      start: boundedOffset,
      end,
      drag: !disabled,
      resize: !disabled && !loop,
    })
    syncing.current = false
  }, [boundedOffset, boundedSource, boundedUsed, disabled, loop])

  return <section className={`music-waveform-editor${loop ? " is-loop" : ""}`} aria-label="Music source window">
    <header><span><b>{loop ? "Loop start" : "Used source window"}</b><small>{loop ? "Drag the purple start marker. The first pass begins here; later passes restart at 0:00." : "Drag the region; resize either edge to choose the exact source window."}</small></span><strong>{loop ? formatDuration(boundedOffset) : `${formatDuration(boundedOffset)} → ${formatDuration(boundedOffset + boundedUsed)}`}</strong></header>
    <div className={`music-waveform-canvas${peaks?.length === 0 ? " is-unavailable" : ""}`}>
      <div className="music-waveform-surface" ref={containerRef} />
      {!peaks && <span className="music-waveform-loading">Loading waveform…</span>}
      {peaks?.length === 0 && <span className="music-waveform-loading">Waveform unavailable</span>}
    </div>
    <div className="music-waveform-ruler" aria-hidden="true"><span>0:00</span><span>{formatDuration(boundedSource / 2)}</span><span>{formatDuration(boundedSource)}</span></div>
  </section>
}
