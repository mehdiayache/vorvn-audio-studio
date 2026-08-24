import { Headphones, Music2, Pause, Play, RefreshCcw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { SwitchLike } from "@/components/switch-like"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, SoundSceneClip, SoundSceneTrack } from "@/types/domain"
import { dbToGain, formatDb, gainToDb, MAX_GAIN_DB, MIN_GAIN_DB } from "../sound-scene-gain"
import { AudioSourceEditor, type AudioSourceWindow } from "../source-editor/music-source-editor"

import "./music-inspector.css"

export function AudioClipInspector({ track, clip, playingKey, playing, onPlay, onClipChange, onClipCommit, onTrackVolumeChange, onTrackVolumeCommit, onChoose, onRemove }: {
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
  const [clipGainDb, setClipGainDb] = useState(gainToDb(clip?.gain ?? .1))
  const [trackGainDb, setTrackGainDb] = useState(gainToDb(track.volume ?? 1))
  const [start, setStart] = useState((clip?.source_offset_ms ?? 0) / 1000)
  const [windowDuration, setWindowDuration] = useState((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000)
  const [fadeIn, setFadeIn] = useState((clip?.fade_in_ms ?? 2000) / 1000)
  const [fadeOut, setFadeOut] = useState((clip?.fade_out_ms ?? 3000) / 1000)
  const [duckAmountDb, setDuckAmountDb] = useState(clip?.duck_amount_db ?? -12)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setClipGainDb(gainToDb(clip?.gain ?? .1)), [clip?.gain])
  useEffect(() => setTrackGainDb(gainToDb(track.volume ?? 1)), [track.volume])
  useEffect(() => setStart((clip?.source_offset_ms ?? 0) / 1000), [clip?.source_offset_ms])
  useEffect(() => setWindowDuration((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000), [clip?.duration_ms, clip?.resolved_duration_ms])
  useEffect(() => setFadeIn((clip?.fade_in_ms ?? 2000) / 1000), [clip?.fade_in_ms])
  useEffect(() => setFadeOut((clip?.fade_out_ms ?? 3000) / 1000), [clip?.fade_out_ms])
  useEffect(() => setDuckAmountDb(clip?.duck_amount_db ?? -12), [clip?.duck_amount_db])

  async function save(label: string, action: () => Promise<void>) {
    setSaving(label)
    setError("")
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Those audio settings could not be saved.") }
    finally { setSaving("") }
  }

  function sourceWindow(next: AudioSourceWindow) {
    setStart(next.sourceOffsetMs / 1000)
    if (next.durationMs !== null) setWindowDuration(next.durationMs / 1000)
    onClipChange({ source_offset_ms: next.sourceOffsetMs, duration_ms: next.durationMs })
  }

  if (!clip?.filename) return <div className="music-workbench-empty"><Music2 /><span><b>No audio</b><p>Add one reusable Audio Library clip to this track.</p></span><Button onClick={onChoose}>Choose audio</Button></div>

  const key = `asset-source:${clip.asset_id}`
  const active = playing && playingKey === key
  const sourceDuration = Math.max(Number(clip.source_duration_ms || 0) / 1000, 0.1)
  const usedDuration = Math.max(windowDuration, .1)
  const geometryLocked = Boolean(clip.locked)
  const effectiveGainDb = Math.max(MIN_GAIN_DB, clipGainDb + trackGainDb)
  const effectivelyVeryQuiet = !track.muted && effectiveGainDb <= -36
  const oneShotAtBedLevel = Boolean(clip.asset_kind && !["music", "ambience"].includes(clip.asset_kind) && clipGainDb <= -12)
  const duckAmountLabel = duckAmountDb === 0 ? "No reduction" : formatDb(duckAmountDb)

  function restoreTrackLevel() {
    setTrackGainDb(0)
    onTrackVolumeChange(1)
    void save("track level", () => onTrackVolumeCommit(1))
  }

  function restoreClipLevel() {
    setClipGainDb(0)
    onClipChange({ gain: 1 })
    void save("clip level", onClipCommit)
  }

  return <div className="music-workbench-content">
    <section className="music-workbench-source">
      <span className="music-workbench-art"><Music2 /></span>
      <div><span className="eyebrow">Audio Library source</span><h3>{clip.asset_name || "Audio"}</h3><p>{formatDuration(sourceDuration)} source · reusable asset</p></div>
      <OperatorIconButton label={active ? "Pause audio audition" : "Play audio audition"} detail="Auditions the source without changing its timeline placement." variant="outline" size="icon" onClick={() => onPlay({ key, url: audioUrl(clip.filename!), title: clip.asset_name || "Audio", subtitle: "Source audition", kind: "asset" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>
    </section>

    <section className="music-workbench-controls">
      <header className="music-placement-header"><h3>Placement</h3><small>Live preview</small></header>
      <AudioSourceEditor
        url={audioUrl(clip.filename)}
        sourceDuration={sourceDuration}
        sourceOffset={start}
        usedDuration={usedDuration}
        loop={Boolean(clip.loop)}
        disabled={Boolean(saving) || geometryLocked}
        onChange={sourceWindow}
        onCommit={(next) => { sourceWindow(next); void save("source window", onClipCommit) }}
      />
      <label title="Changes only this audio placement"><span><Headphones /> Clip gain <b>{formatDb(clipGainDb)}</b></span><Slider aria-label="Audio clip gain" disabled={Boolean(saving)} value={[clipGainDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => { setClipGainDb(value); onClipChange({ gain: dbToGain(value) }) }} onValueCommit={([value = clipGainDb]) => { setClipGainDb(value); onClipChange({ gain: dbToGain(value) }); void save("clip gain", onClipCommit) }} /></label>
      <label title={`Changes every clip on ${track.name}`}><span><Music2 /> Track gain <b>{formatDb(trackGainDb)}</b></span><Slider aria-label="Audio Track gain" disabled={Boolean(saving)} value={[trackGainDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => { setTrackGainDb(value); onTrackVolumeChange(dbToGain(value)) }} onValueCommit={([value = trackGainDb]) => { setTrackGainDb(value); void save("track gain", () => onTrackVolumeCommit(dbToGain(value))) }} /></label>
      {(effectivelyVeryQuiet || oneShotAtBedLevel) && <aside className="music-level-warning" role="status">
        <div><b>{oneShotAtBedLevel ? "This sound is set like a quiet music bed" : "Very quiet in this scene"}</b><p>Clip {formatDb(clipGainDb)} + {track.name} {formatDb(trackGainDb)} = {formatDb(effectiveGainDb)} before narration lowering.</p></div>
        <Button variant="outline" size="sm" disabled={Boolean(saving)} onClick={oneShotAtBedLevel ? restoreClipLevel : restoreTrackLevel}>{oneShotAtBedLevel ? "Set clip to 0 dB" : "Reset track to 0 dB"}</Button>
      </aside>}
      <div className="music-fade-grid">
        <label><span>Fade in <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label="Audio fade in" disabled={Boolean(saving) || geometryLocked} value={[fadeIn]} max={15} step={0.1} onValueChange={([value = 0]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeIn]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }); void save("fade in", onClipCommit) }} /></label>
        <label><span>Fade out <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label="Audio fade out" disabled={Boolean(saving) || geometryLocked} value={[fadeOut]} max={15} step={0.1} onValueChange={([value = 0]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeOut]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }); void save("fade out", onClipCommit) }} /></label>
      </div>
      <SwitchLike label="Loop source" checked={Boolean(clip.loop)} disabled={Boolean(saving) || geometryLocked} onChange={(loop) => { onClipChange({ loop }); void save("looping", onClipCommit) }} />
      <div className="music-duck-control">
        <SwitchLike label="Lower while narration plays" checked={Boolean(clip.ducking)} disabled={Boolean(saving)} onChange={(ducking) => { onClipChange({ ducking }); void save("narration lowering", onClipCommit) }} />
        <p>The audio returns to its normal level between spoken Parts.</p>
        {clip.ducking && <label className="music-duck-amount"><span>Speech reduction <b>{duckAmountLabel}</b></span><Slider aria-label="Speech reduction" disabled={Boolean(saving)} value={[duckAmountDb]} min={-30} max={0} step={1} onValueChange={([value = -12]) => { setDuckAmountDb(value); onClipChange({ duck_amount_db: value }) }} onValueCommit={([value = duckAmountDb]) => { setDuckAmountDb(value); onClipChange({ duck_amount_db: value }); void save("speech reduction", onClipCommit) }} /></label>}
      </div>
      <p className="music-track-state">Starts at {formatDuration(Number(clip.resolved_start_ms || 0) / 1000)} · {track.muted ? "Track muted" : effectivelyVeryQuiet ? "Technically active, but nearly silent" : `Combined level ${formatDb(effectiveGainDb)}`}</p>
      <p className={`music-save-state${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || (saving ? `Saving ${saving}…` : "Saved on release")}</p>
    </section>

    {geometryLocked && <p className="music-lock-note">Editing geometry is locked. Levels and effects remain available.</p>}
    <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving) || geometryLocked} onClick={onChoose}><RefreshCcw /> Replace source</Button><Button variant="ghost" className="danger" disabled={Boolean(saving) || geometryLocked} onClick={onRemove}><Trash2 /> Remove clip</Button></section>
  </div>
}
