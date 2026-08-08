import { Headphones, Music2, Pause, Play, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { SwitchLike } from "@/components/switch-like"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { MusicBed as MusicBedType, PlayerSource } from "@/types/domain"

export function MusicBed({
  music,
  playingKey,
  playing,
  onPlay,
  onChange,
  onChoose,
}: {
  music: MusicBedType
  playingKey?: string
  playing: boolean
  onPlay: (source: PlayerSource) => void
  onChange: (changes: Partial<MusicBedType>) => Promise<void>
  onChoose: () => void
}) {
  const [volume, setVolume] = useState(Math.round((music.volume ?? 0.1) * 100))
  const [start, setStart] = useState(music.start ?? 0)
  useEffect(() => setVolume(Math.round((music.volume ?? 0.1) * 100)), [music.volume])
  useEffect(() => setStart(music.start ?? 0), [music.start])

  if (!music.filename) {
    return (
      <section className="music-empty">
        <span><Music2 /></span><div><h3>Add a background music bed</h3><p>Music plays underneath the whole narration. It does not become another part.</p></div>
        <Button variant="outline" onClick={onChoose}>Choose from Music library</Button>
      </section>
    )
  }

  const key = `asset-source:${music.music_of}`
  const active = playing && playingKey === key
  return (
    <section className="music-bed">
      <div className="music-identity">
        <span className="music-art"><Music2 /></span>
        <div><span className="eyebrow">Background music</span><h3>{music.name || "Music bed"}</h3><p>{formatDuration(Number(music.duration_ms || 0) / 1000)} source · starts at {formatDuration(start)}</p></div>
        <Button variant="outline" size="icon" onClick={() => onPlay({ key, url: audioUrl(music.filename), title: music.name || "Music bed", subtitle: "Source audition", kind: "music" })} aria-label={active ? "Pause music audition" : "Play music audition"}>{active ? <Pause /> : <Play />}</Button>
      </div>
      <div className="mix-controls">
        <label><span><Headphones /> Mix level <b>{volume}%</b></span><Slider value={[volume]} max={60} step={1} onValueChange={([value = 0]) => setVolume(value)} onValueCommit={() => void onChange({ volume: volume / 100 })} /></label>
        <label><span><RotateCcw /> Source position <b>{formatDuration(start)}</b></span><Slider value={[start]} max={Math.max(Number(music.duration_ms || 0) / 1000, 1)} step={0.1} onValueChange={([value = 0]) => setStart(value)} onValueCommit={() => void onChange({ start })} /></label>
        <div className="music-switches">
          <SwitchLike label="Duck under voice" checked={Boolean(music.duck)} onChange={(duck) => void onChange({ duck })} />
          <Button variant="ghost" onClick={onChoose}><SlidersHorizontal /> Replace</Button>
          <Button variant="ghost" className="danger" onClick={() => void onChange({ music_of: null })}><Trash2 /> Remove</Button>
        </div>
      </div>
    </section>
  )
}
