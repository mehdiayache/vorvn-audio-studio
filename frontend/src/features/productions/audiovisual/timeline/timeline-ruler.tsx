import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"

import { formatDuration } from "@/lib/format"

export function TimelineRuler({ marks, pixelsPerSecond, playhead, playbackRange, snapGuide, onSeek }: {
  marks: number[]
  pixelsPerSecond: number
  playhead: number
  playbackRange: { start: number; end: number } | null
  snapGuide: number | null
  onSeek: (event: ReactPointerEvent) => void
}) {
  return <>
    <div className="sound-scene-grid" aria-hidden="true">{marks.map((mark) => <i key={mark} style={{ left: mark * pixelsPerSecond }} />)}</div>
    <div className="sound-scene-ruler" onPointerDown={onSeek}>{marks.map((mark) => <span key={mark} style={{ left: mark * pixelsPerSecond }}>{formatDuration(mark)}</span>)}</div>
    <div className="sound-scene-playhead" style={{ left: playhead * pixelsPerSecond } as CSSProperties}><i /></div>
    {playbackRange && <div className="sound-scene-playback-range" style={{ left: playbackRange.start * pixelsPerSecond, width: Math.max(1, (playbackRange.end - playbackRange.start) * pixelsPerSecond) }} aria-hidden="true" />}
    {snapGuide !== null && <div className="sound-scene-snap-guide" style={{ left: snapGuide * pixelsPerSecond }} />}
  </>
}
