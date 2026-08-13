import { Headphones, Music2, Pause, Play, RefreshCcw, RotateCcw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { SwitchLike } from "@/components/switch-like"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { MusicBed, PlayerSource } from "@/types/domain"

export function MusicWorkbench({ music, playingKey, playing, onPlay, onChange, onChoose, onRemove }: {
  music: MusicBed
  playingKey?: string
  playing: boolean
  onPlay: (source: PlayerSource) => void
  onChange: (changes: Partial<MusicBed>) => Promise<void>
  onChoose: () => void
  onRemove: () => void
}) {
  const [volume, setVolume] = useState(Math.round((music.volume ?? .1) * 100))
  const [start, setStart] = useState(music.start ?? 0)
  const [fadeIn, setFadeIn] = useState(music.fade_in ?? 2)
  const [fadeOut, setFadeOut] = useState(music.fade_out ?? 3)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setVolume(Math.round((music.volume ?? .1) * 100)), [music.volume])
  useEffect(() => setStart(music.start ?? 0), [music.start])
  useEffect(() => setFadeIn(music.fade_in ?? 2), [music.fade_in])
  useEffect(() => setFadeOut(music.fade_out ?? 3), [music.fade_out])

  async function save(label: string, changes: Partial<MusicBed>, rollback?: () => void) {
    setSaving(label); setError("")
    try { await onChange(changes) }
    catch (reason) { rollback?.(); setError(reason instanceof Error ? reason.message : "Those music settings could not be saved.") }
    finally { setSaving("") }
  }

  if (!music.filename || !music.music_of) return <div className="music-workbench-empty"><Music2 /><span><b>No Music Bed</b><p>Music remains parallel to the Sequence. Add one reusable Venture track without creating another Part.</p></span><Button onClick={onChoose}>Choose music</Button></div>

  const key = `asset-source:${music.music_of}`
  const active = playing && playingKey === key
  return <div className="music-workbench-content">
    <section className="music-workbench-source">
      <span className="music-workbench-art"><Music2 /></span>
      <div><span className="eyebrow">Linked Venture source</span><h3>{music.name || "Music bed"}</h3><p>{formatDuration(Number(music.duration_ms || 0) / 1000)} source · reusable asset</p></div>
      <Button variant="outline" size="icon" onClick={() => onPlay({ key, url: audioUrl(music.filename!), title: music.name || "Music bed", subtitle: "Source audition", kind: "music" })} aria-label={active ? "Pause music audition" : "Play music audition"}>{active ? <Pause /> : <Play />}</Button>
    </section>

    <section className="music-workbench-controls">
      <header><div><span className="eyebrow">Current mix</span><h3>Bed placement</h3></div><small>Changes invalidate the current Production preview.</small></header>
      <label><span><Headphones /> Mix level <b>{volume}%</b></span><Slider aria-label="Music mix level" disabled={Boolean(saving)} value={[volume]} max={60} step={1} onValueChange={([value = 0]) => setVolume(value)} onValueCommit={([value = volume]) => { setVolume(value); void save("mix level", { volume: value / 100 }, () => setVolume(Math.round((music.volume ?? .1) * 100))) }} /></label>
      <label><span><RotateCcw /> Source offset <b>{formatDuration(start)}</b></span><Slider aria-label="Music source position" disabled={Boolean(saving)} value={[start]} max={Math.max(Number(music.duration_ms || 0) / 1000, 1)} step={0.1} onValueChange={([value = 0]) => setStart(value)} onValueCommit={([value = start]) => { setStart(value); void save("source position", { start: value }, () => setStart(music.start ?? 0)) }} /></label>
      <div className="music-fade-grid">
        <label><span>Fade in <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label="Music fade in" disabled={Boolean(saving)} value={[fadeIn]} max={15} step={0.1} onValueChange={([value = 0]) => setFadeIn(value)} onValueCommit={([value = fadeIn]) => { setFadeIn(value); void save("fade in", { fade_in: value }, () => setFadeIn(music.fade_in ?? 2)) }} /></label>
        <label><span>Fade out <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label="Music fade out" disabled={Boolean(saving)} value={[fadeOut]} max={15} step={0.1} onValueChange={([value = 0]) => setFadeOut(value)} onValueCommit={([value = fadeOut]) => { setFadeOut(value); void save("fade out", { fade_out: value }, () => setFadeOut(music.fade_out ?? 3)) }} /></label>
      </div>
      <SwitchLike label="Duck under voice" checked={Boolean(music.duck)} disabled={Boolean(saving)} onChange={(duck) => void save("ducking", { duck })} />
      <p className={`music-save-state${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || (saving ? `Saving ${saving}…` : "Mix settings save when each control is released.")}</p>
    </section>

    <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving)} onClick={onChoose}><RefreshCcw /> Replace source</Button><Button variant="ghost" className="danger" disabled={Boolean(saving)} onClick={onRemove}><Trash2 /> Remove Music Bed</Button></section>
  </div>
}
