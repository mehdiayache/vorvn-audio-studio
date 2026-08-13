import { MoreHorizontal, Pause, Play, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { MusicBed, PlayerSource } from "@/types/domain"

export function ProductionMusicLane({ music, playingKey, playing, previewReady, onPlay, onAdd, onEdit }: {
  music: MusicBed
  playingKey?: string
  playing: boolean
  previewReady: boolean
  onPlay: (source: PlayerSource) => void
  onAdd: () => void
  onEdit: () => void
}) {
  if (!music.filename || !music.music_of) return <section className="production-music-lane is-empty" aria-label="Music Bed">
    <div><b>Music Bed</b><small>None · narration only</small></div>
    <Button variant="outline" size="sm" onClick={onAdd}><Plus /> Add</Button>
  </section>

  const key = `asset-source:${music.music_of}`
  const active = playing && playingKey === key
  return <section className="production-music-lane" aria-label="Music Bed">
    <div className="production-music-copy"><b>Music Bed</b><strong>{music.name || "Music bed"}</strong><small>{music.filename} · {formatDuration(Number(music.duration_ms || 0) / 1000)}</small></div>
    <span className={previewReady ? "production-music-status" : "production-music-status is-stale"}>{previewReady ? "Music attached" : "Preview update needed"}</span>
    <Button variant="ghost" size="icon" onClick={() => onPlay({ key, url: audioUrl(music.filename!), title: music.name || "Music bed", subtitle: "Source audition", kind: "music" })} aria-label={active ? "Pause music audition" : "Play music audition"}>{active ? <Pause /> : <Play />}</Button>
    <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit Music Bed"><MoreHorizontal /></Button>
  </section>
}
