import { Headphones, Music2, Pause, Play, RefreshCcw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { SwitchLike } from "@/components/switch-like"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, SoundSceneClip, SoundSceneTrack } from "@/types/domain"
import { MusicWaveformEditor } from "./music-waveform-editor"

import "./music-workbench.css"

export function MusicWorkbench({ track, clip, playingKey, playing, onPlay, onChange, onChoose, onRemove }: {
  track: SoundSceneTrack
  clip: SoundSceneClip | null
  playingKey?: string
  playing: boolean
  onPlay: (source: PlayerSource) => void
  onChange: (changes: Partial<SoundSceneClip>) => Promise<void>
  onChoose: () => void
  onRemove: () => void
}) {
  const [volume, setVolume] = useState(Math.round((clip?.gain ?? .1) * 100))
  const [start, setStart] = useState((clip?.source_offset_ms ?? 0) / 1000)
  const [fadeIn, setFadeIn] = useState((clip?.fade_in_ms ?? 2000) / 1000)
  const [fadeOut, setFadeOut] = useState((clip?.fade_out_ms ?? 3000) / 1000)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setVolume(Math.round((clip?.gain ?? .1) * 100)), [clip?.gain])
  useEffect(() => setStart((clip?.source_offset_ms ?? 0) / 1000), [clip?.source_offset_ms])
  useEffect(() => setFadeIn((clip?.fade_in_ms ?? 2000) / 1000), [clip?.fade_in_ms])
  useEffect(() => setFadeOut((clip?.fade_out_ms ?? 3000) / 1000), [clip?.fade_out_ms])

  async function save(label: string, changes: Partial<SoundSceneClip>, rollback?: () => void) {
    setSaving(label); setError("")
    try { await onChange(changes) }
    catch (reason) { rollback?.(); setError(reason instanceof Error ? reason.message : "Those music settings could not be saved.") }
    finally { setSaving("") }
  }

  if (!clip?.filename) return <div className="music-workbench-empty"><Music2 /><span><b>No Music</b><p>Add one reusable Venture track to the Sound Scene.</p></span><Button onClick={onChoose}>Choose music</Button></div>

  const key = `asset-source:${clip.asset_id}`
  const active = playing && playingKey === key
  const sourceDuration = Math.max(Number(clip.source_duration_ms || 0) / 1000, 0.1)
  return <div className="music-workbench-content">
    <section className="music-workbench-source">
      <span className="music-workbench-art"><Music2 /></span>
      <div><span className="eyebrow">Linked Venture source</span><h3>{clip.asset_name || "Music"}</h3><p>{formatDuration(sourceDuration)} source · reusable asset</p></div>
      <Button variant="outline" size="icon" onClick={() => onPlay({ key, url: audioUrl(clip.filename!), title: clip.asset_name || "Music", subtitle: "Source audition", kind: "music" })} aria-label={active ? "Pause music audition" : "Play music audition"}>{active ? <Pause /> : <Play />}</Button>
    </section>

    <section className="music-workbench-controls">
      <header><div><span className="eyebrow">Current mix</span><h3>Bed placement</h3></div><small>Changes invalidate the current Production preview.</small></header>
      <MusicWaveformEditor url={audioUrl(clip.filename)} duration={sourceDuration} value={start} disabled={Boolean(saving)} onChange={setStart} onCommit={(value) => { setStart(value); void save("source position", { source_offset_ms: Math.round(value * 1000) }, () => setStart((clip.source_offset_ms ?? 0) / 1000)) }} />
      <label><span><Headphones /> Mix level <b>{volume}%</b></span><Slider aria-label="Music mix level" disabled={Boolean(saving)} value={[volume]} max={100} step={1} onValueChange={([value = 0]) => setVolume(value)} onValueCommit={([value = volume]) => { setVolume(value); void save("mix level", { gain: value / 100 }, () => setVolume(Math.round((clip.gain ?? .1) * 100))) }} /></label>
      <div className="music-fade-grid">
        <label><span>Fade in <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label="Music fade in" disabled={Boolean(saving)} value={[fadeIn]} max={15} step={0.1} onValueChange={([value = 0]) => setFadeIn(value)} onValueCommit={([value = fadeIn]) => { setFadeIn(value); void save("fade in", { fade_in_ms: Math.round(value * 1000) }, () => setFadeIn((clip.fade_in_ms ?? 0) / 1000)) }} /></label>
        <label><span>Fade out <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label="Music fade out" disabled={Boolean(saving)} value={[fadeOut]} max={15} step={0.1} onValueChange={([value = 0]) => setFadeOut(value)} onValueCommit={([value = fadeOut]) => { setFadeOut(value); void save("fade out", { fade_out_ms: Math.round(value * 1000) }, () => setFadeOut((clip.fade_out_ms ?? 0) / 1000)) }} /></label>
      </div>
      <SwitchLike label="Loop source" checked={Boolean(clip.loop)} disabled={Boolean(saving)} onChange={(loop) => void save("looping", { loop })} />
      <SwitchLike label="Duck under voice" checked={Boolean(clip.ducking)} disabled={Boolean(saving)} onChange={(ducking) => void save("ducking", { ducking })} />
      <p className="music-track-state">Starts at {formatDuration(Number(clip.resolved_start_ms || 0) / 1000)} · {track.muted ? "Track muted" : "Track audible"}</p>
      <p className={`music-save-state${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || (saving ? `Saving ${saving}…` : "Mix settings save when each control is released.")}</p>
    </section>

    <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving)} onClick={onChoose}><RefreshCcw /> Replace source</Button><Button variant="ghost" className="danger" disabled={Boolean(saving)} onClick={onRemove}><Trash2 /> Remove Music Bed</Button></section>
  </div>
}
