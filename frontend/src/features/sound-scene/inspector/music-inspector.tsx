import { AudioWaveform, ChevronDown, CircleHelp, Headphones, Music2, Pause, Play, RefreshCcw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { soundClipSourceUrl } from "../engine/sound-clip-source"
import { assetSourceLine } from "@/lib/asset-provenance"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, SoundSceneClip, SoundSceneTrack, VentureAsset } from "@/types/domain"
import { dbToGain, formatDb, gainToDb, MAX_GAIN_DB, MIN_GAIN_DB } from "../sound-scene-gain"
import { AudioSourceEditor, type AudioSourceWindow } from "../source-editor/music-source-editor"

import "./music-inspector.css"

function categoryName(value?: string | null) {
  const category = String(value || "other").toLowerCase()
  if (category === "sfx") return "SFX"
  return category.charAt(0).toUpperCase() + category.slice(1)
}

function technicalSummary(asset: VentureAsset | undefined, sourceDuration: number) {
  const facts = [formatDuration(sourceDuration)]
  if (asset?.audio_format) facts.push(String(asset.audio_format).toUpperCase())
  if (asset?.sample_rate) facts.push(`${(Number(asset.sample_rate) / 1000).toFixed(Number(asset.sample_rate) % 1000 ? 1 : 0)} kHz`)
  if (asset?.channels) facts.push(Number(asset.channels) === 1 ? "Mono" : Number(asset.channels) === 2 ? "Stereo" : `${asset.channels} channels`)
  return facts.join(" · ")
}

export function AudioClipInspector({ track, clip, asset, playingKey, playing, onPlay, onClipChange, onClipCommit, onTrackVolumeChange, onTrackVolumeCommit, onChoose, onRemove }: {
  track: SoundSceneTrack
  clip: SoundSceneClip | null
  asset?: VentureAsset
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
  const [clipGainDb, setClipGainDb] = useState(gainToDb(clip?.gain ?? 1))
  const [trackGainDb, setTrackGainDb] = useState(gainToDb(track.volume ?? 1))
  const [start, setStart] = useState((clip?.source_offset_ms ?? 0) / 1000)
  const [windowDuration, setWindowDuration] = useState((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000)
  const [fadeIn, setFadeIn] = useState((clip?.fade_in_ms ?? 0) / 1000)
  const [fadeOut, setFadeOut] = useState((clip?.fade_out_ms ?? 0) / 1000)
  const [duckAmountDb, setDuckAmountDb] = useState(clip?.duck_amount_db ?? -12)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setClipGainDb(gainToDb(clip?.gain ?? 1)), [clip?.gain])
  useEffect(() => setTrackGainDb(gainToDb(track.volume ?? 1)), [track.volume])
  useEffect(() => setStart((clip?.source_offset_ms ?? 0) / 1000), [clip?.source_offset_ms])
  useEffect(() => setWindowDuration((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000), [clip?.duration_ms, clip?.resolved_duration_ms])
  useEffect(() => setFadeIn((clip?.fade_in_ms ?? 0) / 1000), [clip?.fade_in_ms])
  useEffect(() => setFadeOut((clip?.fade_out_ms ?? 0) / 1000), [clip?.fade_out_ms])
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
  const sourceDuration = Math.max(Number(asset?.duration_ms || clip.source_duration_ms || 0) / 1000, 0.1)
  const usedDuration = Math.max(windowDuration, .1)
  const geometryLocked = Boolean(clip.locked)
  const effectiveGainDb = Math.max(MIN_GAIN_DB, clipGainDb + trackGainDb)
  const category = String(asset?.category || clip.asset_kind || "other").toLowerCase()
  const SourceIcon = category === "sfx" ? AudioWaveform : Music2
  const duckAmountLabel = duckAmountDb === 0 ? "No reduction" : formatDb(duckAmountDb)
  const placement = `Starts ${formatDuration(Number(clip.resolved_start_ms || 0) / 1000)} · ${clip.loop ? "Loops to fill its placement" : `Uses ${formatDuration(usedDuration)}`}`

  function setDucking(ducking: boolean) {
    const nextAmount = ducking && duckAmountDb === 0 ? -12 : duckAmountDb
    if (nextAmount !== duckAmountDb) setDuckAmountDb(nextAmount)
    onClipChange({ ducking, ...(ducking ? { duck_amount_db: nextAmount } : {}) })
    void save("auto-duck", onClipCommit)
  }

  return <div className="music-workbench-content" data-category={category}>
    <section className="music-workbench-source">
      <span className="music-workbench-art"><SourceIcon /></span>
      <div><span className="eyebrow">{categoryName(category)} · {asset ? assetSourceLine(asset) : "Audio Library"}</span><h3>{asset?.title || asset?.name || clip.asset_name || "Audio"}</h3><p>{technicalSummary(asset, sourceDuration)}</p></div>
      <OperatorIconButton label={active ? "Pause audio audition" : "Play audio audition"} detail="Auditions the source without changing its timeline placement." variant="outline" size="icon" onClick={() => onPlay({ key, url: soundClipSourceUrl(clip), title: clip.asset_name || "Audio", subtitle: "Source audition", kind: "asset" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>
    </section>

    <section className="music-workbench-section">
      <header><div><h3>Source & timing</h3><p>{placement}</p></div><span>Live preview</span></header>
      <AudioSourceEditor url={soundClipSourceUrl(clip)} sourceDuration={sourceDuration} sourceOffset={start} usedDuration={usedDuration} loop={Boolean(clip.loop)} disabled={Boolean(saving) || geometryLocked} onChange={sourceWindow} onCommit={(next) => { sourceWindow(next); void save("source window", onClipCommit) }} />
    </section>

    <section className="music-workbench-section music-level-section">
      <header><div><h3>Level</h3><p>This placement in the mix</p></div><strong>{formatDb(clipGainDb)}</strong></header>
      <label className="music-primary-level"><span><Headphones /> Clip level <b>{formatDb(clipGainDb)}</b></span><Slider aria-label="Audio clip gain" disabled={Boolean(saving)} value={[clipGainDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => { setClipGainDb(value); onClipChange({ gain: dbToGain(value) }) }} onValueCommit={([value = clipGainDb]) => { setClipGainDb(value); onClipChange({ gain: dbToGain(value) }); void save("clip level", onClipCommit) }} /></label>
      <p className="music-output-fact">Output {formatDb(effectiveGainDb)} <span>Clip {formatDb(clipGainDb)} + Track {formatDb(trackGainDb)}</span></p>
      <Collapsible className="music-advanced-level">
        <CollapsibleTrigger><span>Advanced track level</span><b>{formatDb(trackGainDb)}</b><ChevronDown /></CollapsibleTrigger>
        <CollapsibleContent><label><span><Music2 /> Track level <b>{formatDb(trackGainDb)}</b></span><Slider aria-label="Audio Track gain" disabled={Boolean(saving)} value={[trackGainDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => { setTrackGainDb(value); onTrackVolumeChange(dbToGain(value)) }} onValueCommit={([value = trackGainDb]) => { setTrackGainDb(value); void save("track level", () => onTrackVolumeCommit(dbToGain(value))) }} /></label><p>Changes every clip placed on this track.</p></CollapsibleContent>
      </Collapsible>
    </section>

    <section className="music-workbench-section">
      <header><div><h3>Shape</h3><p>Entrance, exit and playback behavior</p></div></header>
      <div className="music-fade-grid">
        <label><span>Fade in <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label="Audio fade in" disabled={Boolean(saving) || geometryLocked} value={[fadeIn]} max={15} step={0.1} onValueChange={([value = 0]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeIn]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }); void save("fade in", onClipCommit) }} /></label>
        <label><span>Fade out <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label="Audio fade out" disabled={Boolean(saving) || geometryLocked} value={[fadeOut]} max={15} step={0.1} onValueChange={([value = 0]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeOut]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }); void save("fade out", onClipCommit) }} /></label>
      </div>
      <div className="music-behavior-list">
        <label className="music-behavior-row"><span><b>Loop source</b><small>Repeat this source for the full placement.</small></span><Switch aria-label="Loop source" checked={Boolean(clip.loop)} disabled={Boolean(saving) || geometryLocked} onCheckedChange={(loop) => { onClipChange({ loop }); void save("looping", onClipCommit) }} /></label>
        <div className="music-duck-control">
          <label className="music-behavior-row"><span><b>Auto-duck under voice <OperatorTooltip label="How auto-duck works" detail="Only this clip is lowered while narration is audible. It returns to its normal level between spoken Parts."><button type="button" className="music-help" aria-label="Explain auto-duck"><CircleHelp /></button></OperatorTooltip></b><small>{clip.ducking ? `During narration: ${duckAmountLabel}` : "Keep the clip at its normal level."}</small></span><Switch aria-label="Auto-duck under voice" checked={Boolean(clip.ducking)} disabled={Boolean(saving)} onCheckedChange={setDucking} /></label>
          {clip.ducking && <label className="music-duck-amount"><span>During narration <b>{duckAmountLabel}</b></span><Slider aria-label="Speech reduction" disabled={Boolean(saving)} value={[duckAmountDb]} min={-30} max={0} step={1} onValueChange={([value = -12]) => { setDuckAmountDb(value); onClipChange({ duck_amount_db: value }) }} onValueCommit={([value = duckAmountDb]) => { setDuckAmountDb(value); onClipChange({ duck_amount_db: value }); void save("duck amount", onClipCommit) }} /></label>}
        </div>
      </div>
      <p className={`music-save-state${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{error || (saving ? `Saving ${saving}…` : "Changes save on release")}</p>
    </section>

    {geometryLocked && <p className="music-lock-note">Timing is locked. Level and effects remain available.</p>}
    <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving) || geometryLocked} onClick={onChoose}><RefreshCcw /> Replace source</Button><Button variant="ghost" className="danger" disabled={Boolean(saving) || geometryLocked} onClick={onRemove}><Trash2 /> Remove clip</Button></section>
  </div>
}
