import { useEffect, useId, useState } from "react"

const waveformCache = new Map<string, Promise<number[]>>()

async function decodeWaveform(url: string, bars: number) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Audio unavailable (${response.status})`)
  const data = await response.arrayBuffer()
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) throw new Error("Audio decoding is unavailable")
  const context = new AudioContextClass()
  try {
    const buffer = await context.decodeAudioData(data.slice(0))
    const channel = buffer.getChannelData(0)
    const stride = Math.max(1, Math.floor(channel.length / bars))
    const peaks = Array.from({ length: bars }, (_, index) => {
      const start = index * stride
      const end = Math.min(channel.length, start + stride)
      let peak = 0
      for (let sample = start; sample < end; sample += Math.max(1, Math.floor(stride / 32))) peak = Math.max(peak, Math.abs(channel[sample] || 0))
      return peak
    })
    const max = Math.max(...peaks, 0.01)
    return peaks.map((peak) => Math.max(0.08, peak / max))
  } finally {
    void context.close()
  }
}

export function AudioWaveform({ url, bars = 48 }: { url?: string; bars?: number }) {
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const gradientId = useId().replace(/:/g, "")

  useEffect(() => {
    let active = true
    if (!url) { setPeaks(null); return () => { active = false } }
    const key = `${url}:${bars}`
    const pending = waveformCache.get(key) || decodeWaveform(url, bars)
    waveformCache.set(key, pending)
    pending.then((value) => { if (active) setPeaks(value) }).catch(() => { if (active) setPeaks([]) })
    return () => { active = false }
  }, [url, bars])

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
