import { Blend, ChevronDown, CircleHelp, Clock3, Music2, Pause, Play, RefreshCcw, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { soundClipSourceUrl } from "../engine/sound-clip-source"
import { assetSourceLine } from "@/lib/asset-provenance"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, SoundSceneClip, SoundSceneTrack, VentureAsset } from "@/types/domain"
import { AudioVolumeControl, type AudioVolumeMix } from "../components/audio-volume-control"
import { AUDIO_FAMILY_LABELS, SoundMediaIcon, audioAssetFamily, audioUsageTags } from "../audio-presentation"
import { formatDb, gainToVolumePercent } from "../sound-scene-gain"
import { AudioSourceEditor, type AudioSourceWindow } from "../source-editor/music-source-editor"

import "./music-inspector.css"

function technicalSummary(asset: VentureAsset | undefined, sourceDuration: number) {
  const facts = [formatDuration(sourceDuration)]
  if (asset?.audio_format) facts.push(String(asset.audio_format).toUpperCase())
  if (asset?.sample_rate) facts.push(`${(Number(asset.sample_rate) / 1000).toFixed(Number(asset.sample_rate) % 1000 ? 1 : 0)} kHz`)
  if (asset?.channels) facts.push(Number(asset.channels) === 1 ? "Mono" : Number(asset.channels) === 2 ? "Stereo" : `${asset.channels} channels`)
  return facts.join(" · ")
}

export function AudioClipInspector({ track, clip, asset, playingKey, playing, onPlay, onClipChange, onClipCommit, onTrackMixChange, onTrackMixCommit, onChoose }: {
  track: SoundSceneTrack
  clip: SoundSceneClip | null
  asset?: VentureAsset
  playingKey?: string
  playing: boolean
  onPlay: (source: PlayerSource) => void
  onClipChange: (changes: Partial<SoundSceneClip>) => void
  onClipCommit: () => Promise<void>
  onTrackMixChange: (mix: AudioVolumeMix) => void
  onTrackMixCommit: (mix: AudioVolumeMix) => Promise<void>
  onChoose: () => void
}) {
  const [start, setStart] = useState((clip?.source_offset_ms ?? 0) / 1000)
  const [windowDuration, setWindowDuration] = useState((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000)
  const [fadeIn, setFadeIn] = useState((clip?.fade_in_ms ?? 0) / 1000)
  const [fadeOut, setFadeOut] = useState((clip?.fade_out_ms ?? 0) / 1000)
  const [duckAmountDb, setDuckAmountDb] = useState(clip?.duck_amount_db ?? -12)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
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

  if (!clip?.filename) return <div className="music-workbench-empty"><Music2 /><span><b>No audio</b><p>Add one reusable audio Asset to this track.</p></span><Button onClick={onChoose}>Choose audio</Button></div>

  const key = `asset-source:${clip.asset_id}`
  const active = playing && playingKey === key
  const sourceDuration = Math.max(Number(asset?.duration_ms || clip.source_duration_ms || 0) / 1000, 0.1)
  const usedDuration = Math.max(windowDuration, .1)
  const geometryLocked = Boolean(clip.locked)
  const clipVolume = clip.muted || clip.gain <= 0 ? 0 : gainToVolumePercent(clip.gain)
  const trackVolume = track.muted || track.volume <= 0 ? 0 : gainToVolumePercent(track.volume)
  const outputVolume = clipVolume === 0 || trackVolume === 0 ? 0 : Math.round(clip.gain * track.volume * 100)
  const category = audioAssetFamily(asset || { category: clip.asset_kind })
  const usage = audioUsageTags(asset).find((tag) => tag === "intro" || tag === "outro" || tag === "jingle" || tag === "stinger")
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
      <span className="music-workbench-art"><SoundMediaIcon kind={category} /></span>
      <div><span className="eyebrow">{AUDIO_FAMILY_LABELS[category]}{usage ? ` · ${usage}` : ""}</span><h3>{asset?.title || asset?.name || clip.asset_name || "Audio"}</h3><p>{asset ? `${assetSourceLine(asset)} · ${technicalSummary(asset, sourceDuration)}` : technicalSummary(asset, sourceDuration)}</p></div>
      <OperatorIconButton label={active ? "Pause audio audition" : "Play audio audition"} detail="Auditions the source without changing its timeline placement." variant="outline" size="icon" onClick={() => onPlay({ key, url: soundClipSourceUrl(clip), title: clip.asset_name || "Audio", subtitle: "Source audition", kind: "asset" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>
    </section>

    <OperatorInspectorSection icon={Clock3} title="Source & timing" meta="Live preview" help="Drag the source window to choose which part of the reusable asset this placement uses." className="music-workbench-section">
      <p className="music-section-context">{placement}</p>
      <AudioSourceEditor url={soundClipSourceUrl(clip)} sourceDuration={sourceDuration} sourceOffset={start} usedDuration={usedDuration} loop={Boolean(clip.loop)} disabled={Boolean(saving) || geometryLocked} onChange={sourceWindow} onCommit={(next) => { sourceWindow(next); void save("source window", onClipCommit) }} />
    </OperatorInspectorSection>

    <OperatorInspectorSection icon={SlidersHorizontal} title="Volume" meta={`${clipVolume}%`} metaTechnical help="Clip volume affects this placement. Track volume affects every clip on the same track." className="music-workbench-section music-level-section">
      <AudioVolumeControl label="Clip volume" gain={clip.gain} muted={clip.muted} disabled={Boolean(saving)} onPreview={({ gain, muted }) => onClipChange({ gain, muted })} onCommit={({ gain, muted }) => { onClipChange({ gain, muted }); return save("clip volume", onClipCommit) }} />
      <p className="music-output-fact">Output {outputVolume}% <span>Clip {clipVolume}% × Track {trackVolume}%</span></p>
      <Collapsible className="music-advanced-level">
        <CollapsibleTrigger><span>Track volume</span><b>{trackVolume}%</b><ChevronDown /></CollapsibleTrigger>
        <CollapsibleContent><AudioVolumeControl label="Track volume" gain={track.volume} muted={track.muted} disabled={Boolean(saving)} onPreview={onTrackMixChange} onCommit={(mix) => save("track volume", () => onTrackMixCommit(mix))} /><p>Changes every clip placed on this track.</p></CollapsibleContent>
      </Collapsible>
    </OperatorInspectorSection>

    <OperatorInspectorSection icon={Blend} title="Shape" help="Control the clip entrance, exit, looping and how it yields beneath narration." className="music-workbench-section">
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
    </OperatorInspectorSection>

    {geometryLocked && <p className="music-lock-note">Timing is locked. Volume and effects remain available.</p>}
    <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving) || geometryLocked} onClick={onChoose}><RefreshCcw /> Replace source</Button></section>
  </div>
}
