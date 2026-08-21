import { Headphones, Music2, Pause, Play, RefreshCcw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { SwitchLike } from "@/components/switch-like"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, SoundSceneClip, SoundSceneTrack } from "@/types/domain"
import { MusicSourceEditor, type MusicSourceWindow } from "../source-editor/music-source-editor"

import "./music-inspector.css"

export function MusicInspector({ track, clip, playingKey, playing, onPlay, onClipChange, onClipCommit, onTrackVolumeChange, onTrackVolumeCommit, onChoose, onRemove }: {
  track: SoundSceneTrack
  clip: SoundSceneClip | null
  playingKey?: string
  playing: boolean
  onPlay: (source: PlayerSource) => void
  onClipChange: (changes: Partial<SoundSceneClip>) => void
  onClipCommit: () => Promise<void>
  onTrackVolumeChange: (volume: number) => void
  onTrackVolumeCommit: (volume: number) => Promise<void>
  onChoose: () => void
  onRemove: () => void
}) {
  const [volume, setVolume] = useState(Math.round((clip?.gain ?? .1) * 100))
  const [trackVolume, setTrackVolume] = useState(Math.round((track.volume ?? 1) * 100))
  const [start, setStart] = useState((clip?.source_offset_ms ?? 0) / 1000)
  const [windowDuration, setWindowDuration] = useState((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000)
  const [fadeIn, setFadeIn] = useState((clip?.fade_in_ms ?? 2000) / 1000)
  const [fadeOut, setFadeOut] = useState((clip?.fade_out_ms ?? 3000) / 1000)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setVolume(Math.round((clip?.gain ?? .1) * 100)), [clip?.gain])
  useEffect(() => setTrackVolume(Math.round((track.volume ?? 1) * 100)), [track.volume])
  useEffect(() => setStart((clip?.source_offset_ms ?? 0) / 1000), [clip?.source_offset_ms])
  useEffect(() => setWindowDuration((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000), [clip?.duration_ms, clip?.resolved_duration_ms])
  useEffect(() => setFadeIn((clip?.fade_in_ms ?? 2000) / 1000), [clip?.fade_in_ms])
  useEffect(() => setFadeOut((clip?.fade_out_ms ?? 3000) / 1000), [clip?.fade_out_ms])

  async function save(label: string, action: () => Promise<void>) {
    setSaving(label)
    setError("")
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Those music settings could not be saved.") }
    finally { setSaving("") }
  }

  function sourceWindow(next: MusicSourceWindow) {
    setStart(next.sourceOffsetMs / 1000)
    if (next.durationMs !== null) setWindowDuration(next.durationMs / 1000)
    onClipChange({ source_offset_ms: next.sourceOffsetMs, duration_ms: next.durationMs })
  }

  if (!clip?.filename) return <div className="music-workbench-empty"><Music2 /><span><b>No Music</b><p>Add one reusable Venture track to the Sound Scene.</p></span><Button onClick={onChoose}>Choose music</Button></div>

  const key = `asset-source:${clip.asset_id}`
  const active = playing && playingKey === key
  const sourceDuration = Math.max(Number(clip.source_duration_ms || 0) / 1000, 0.1)
  const usedDuration = Math.max(windowDuration, .1)
  const geometryLocked = Boolean(clip.locked)
  return <div className="music-workbench-content">
    <section className="music-workbench-source">
      <span className="music-workbench-art"><Music2 /></span>
      <div><span className="eyebrow">Linked Venture source</span><h3>{clip.asset_name || "Music"}</h3><p>{formatDuration(sourceDuration)} source · reusable asset</p></div>
      <OperatorIconButton label={active ? "Pause Music audition" : "Play Music audition"} detail="Auditions the source without changing its timeline placement." variant="outline" size="icon" onClick={() => onPlay({ key, url: audioUrl(clip.filename!), title: clip.asset_name || "Music", subtitle: "Source audition", kind: "music" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>
    </section>

    <section className="music-workbench-controls">
      <header className="music-placement-header"><h3>Placement</h3><small>Live preview</small></header>
      <MusicSourceEditor
        url={audioUrl(clip.filename)}
        sourceDuration={sourceDuration}
        sourceOffset={start}
        usedDuration={usedDuration}
        loop={Boolean(clip.loop)}
        disabled={Boolean(saving) || geometryLocked}
        onChange={sourceWindow}
        onCommit={(next) => { sourceWindow(next); void save("source window", onClipCommit) }}
      />
      <label title="Changes only this Music placement"><span><Headphones /> Clip level <b>{volume}%</b></span><Slider aria-label="Music clip level" disabled={Boolean(saving)} value={[volume]} max={200} step={1} onValueChange={([value = 0]) => { setVolume(value); onClipChange({ gain: value / 100 }) }} onValueCommit={([value = volume]) => { setVolume(value); onClipChange({ gain: value / 100 }); void save("clip level", onClipCommit) }} /></label>
      <label title={`Changes every clip on ${track.name}`}><span><Music2 /> Track level <b>{trackVolume}%</b></span><Slider aria-label="Music track level" disabled={Boolean(saving)} value={[trackVolume]} max={200} step={1} onValueChange={([value = 0]) => { setTrackVolume(value); onTrackVolumeChange(value / 100) }} onValueCommit={([value = trackVolume]) => { setTrackVolume(value); void save("track level", () => onTrackVolumeCommit(value / 100)) }} /></label>
      <div className="music-fade-grid">
        <label><span>Fade in <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label="Music fade in" disabled={Boolean(saving) || geometryLocked} value={[fadeIn]} max={15} step={0.1} onValueChange={([value = 0]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeIn]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }); void save("fade in", onClipCommit) }} /></label>
        <label><span>Fade out <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label="Music fade out" disabled={Boolean(saving) || geometryLocked} value={[fadeOut]} max={15} step={0.1} onValueChange={([value = 0]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeOut]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }); void save("fade out", onClipCommit) }} /></label>
      </div>
      <SwitchLike label="Loop source" checked={Boolean(clip.loop)} disabled={Boolean(saving) || geometryLocked} onChange={(loop) => { onClipChange({ loop }); void save("looping", onClipCommit) }} />
      <SwitchLike label="Duck under Sequence" checked={Boolean(clip.ducking)} disabled={Boolean(saving)} onChange={(ducking) => { onClipChange({ ducking }); void save("ducking", onClipCommit) }} />
      <p className="music-track-state">Starts at {formatDuration(Number(clip.resolved_start_ms || 0) / 1000)} · {track.muted ? "Track muted" : "Track audible"}</p>
      <p className={`music-save-state${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || (saving ? `Saving ${saving}…` : "Saved on release")}</p>
    </section>

    {geometryLocked && <p className="music-lock-note">Editing geometry is locked. Levels and effects remain available.</p>}
    <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving) || geometryLocked} onClick={onChoose}><RefreshCcw /> Replace source</Button><Button variant="ghost" className="danger" disabled={Boolean(saving) || geometryLocked} onClick={onRemove}><Trash2 /> Remove clip</Button></section>
  </div>
}
