import { useEffect, useId, useState } from "react"

const waveformCache = new Map<string, Promise<number[]>>()

async function fetchWaveform(url: string, bars: number) {
  const path = new URL(url, window.location.origin).pathname
  const filename = decodeURIComponent(path.split("/").pop() || "")
  if (!filename) throw new Error("Audio filename is unavailable")
  const response = await fetch(`/api/v1/media/peaks/${encodeURIComponent(filename)}?bars=${bars}`)
  if (!response.ok) throw new Error(`Waveform unavailable (${response.status})`)
  const payload = await response.json() as { data: { peaks: number[] } }
  return payload.data.peaks
}

export function useAudioPeaks(url?: string, bars = 48) {
  const [peaks, setPeaks] = useState<number[] | null>(null)

  useEffect(() => {
    let active = true
    if (!url) { setPeaks(null); return () => { active = false } }
    const key = `${url}:${bars}`
    const pending = waveformCache.get(key) || fetchWaveform(url, bars)
    waveformCache.set(key, pending)
    pending.then((value) => { if (active) setPeaks(value) }).catch(() => { if (active) setPeaks([]) })
    return () => { active = false }
  }, [url, bars])
  return peaks
}

export function AudioWaveform({ url, bars = 48 }: { url?: string; bars?: number }) {
  const peaks = useAudioPeaks(url, bars)
  const gradientId = useId().replace(/:/g, "")

  if (!url || peaks?.length === 0) return <span className="waveform-unavailable" aria-hidden="true" />
  if (!peaks) return <span className="waveform-loading" aria-hidden="true" />
  const gap = 1.5
  const barWidth = 2
  const width = peaks.length * (barWidth + gap)
  return (
    <svg className="audio-waveform" viewBox={`0 0 ${width} 28`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".78" /><stop offset="1" stopColor="currentColor" stopOpacity=".28" /></linearGradient></defs>
      {peaks.map((peak, index) => {
        const height = Math.max(2, peak * 24)
        return <rect key={index} x={index * (barWidth + gap)} y={(28 - height) / 2} width={barWidth} height={height} rx="1" fill={`url(#${gradientId})`} />
      })}
    </svg>
  )
}
