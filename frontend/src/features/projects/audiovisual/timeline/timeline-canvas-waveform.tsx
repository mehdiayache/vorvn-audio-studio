import { useEffect, useRef, useState } from "react"

import { useAudioPeaks } from "@/components/audio-waveform"
import { loopBoundaryTimes, waveformPeakIndex, type WaveformProjection } from "@/features/sound-scene/timeline/waveform-projection"

const PEAK_TIERS = [128, 256, 512, 1024, 2048, 4096] as const

export function TimelineCanvasWaveform({ url, projection }: { url?: string; projection?: WaveformProjection }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tier, setTier] = useState<number>(128)
  const peaks = useAudioPeaks(url, tier)

  useEffect(() => {
    const node = canvas.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.ceil(entry?.contentRect.width || 1))
      setTier(PEAK_TIERS.find((value) => value >= width) || 4096)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [Boolean(peaks?.length)])

  useEffect(() => {
    const node = canvas.current
    if (!node || !peaks?.length) return
    const draw = () => {
      const rect = node.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      node.width = Math.max(1, Math.round(rect.width * ratio))
      node.height = Math.max(1, Math.round(rect.height * ratio))
      const context = node.getContext("2d")
      if (!context) return
      context.clearRect(0, 0, node.width, node.height)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = getComputedStyle(node).color
      context.globalAlpha = .62
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const columns = Math.max(1, Math.min(4_096, Math.ceil(width)))
      const bar = width / columns
      for (let column = 0; column < columns; column += 1) {
        const index = projection
          ? waveformPeakIndex(column, columns, peaks.length, projection)
          : Math.min(peaks.length - 1, Math.floor(column / columns * peaks.length))
        const peak = peaks[index] || 0
        const peakHeight = peak * height * .82
        if (peakHeight > 0) context.fillRect(column * bar, (height - peakHeight) / 2, Math.max(.7, bar * .58), peakHeight)
      }
      if (projection?.loop) {
        context.globalAlpha = .24
        for (const boundary of loopBoundaryTimes(projection)) context.fillRect(Math.round(boundary / projection.clipDuration * width), 0, 1, height)
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(node)
    return () => observer.disconnect()
  }, [peaks, projection?.clipDuration, projection?.loop, projection?.sourceDuration, projection?.sourceOffset])

  if (!url || peaks?.length === 0) return <span className="sound-scene-waveform-state is-unavailable" aria-hidden="true">Waveform unavailable</span>
  if (!peaks) return <span className="sound-scene-waveform-state is-loading" aria-hidden="true"><i /><i /><i /><i /></span>
  return <canvas ref={canvas} className="sound-scene-waveform" aria-hidden="true" />
}
