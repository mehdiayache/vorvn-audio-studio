import {FeedbackMessage} from "../ui/feedback-message"
import {inspectorText,type InspectorLocale} from "./studio-inspector-copy"
import { Blend, ChevronDown, CircleHelp, Clock3, Music2, Pause, Play, RefreshCcw, SlidersHorizontal } from "lucide-react"
import { useEffect, useState, type ReactNode, type ComponentProps } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
const soundClipSourceUrl = (clip: SoundSceneClip) => clip.sourceUrl || ""
const fileSourceLine = (file: InspectorFile) => file.provenance || ""
import { formatMediaTime as formatDuration } from "../../lib/media-time"
import type { SoundSceneClip, SoundSceneTrack } from "./studio-timeline-model"
import type { InspectorFile } from "./studio-inspector-model"
type PlayerSource = {key:string;url:string;title:string;subtitle:string;kind:"file"}
import { AudioVolumeControl, type AudioVolumeMix } from "./audio-volume-control"
import { AUDIO_FAMILY_LABELS, SoundMediaIcon, audioFamily } from "./studio-audio-presentation"
const audioFileFamily = (file: Pick<InspectorFile,"category">) => audioFamily(file.category)
const audioUsageTags = (file?: InspectorFile) => [...new Set((file?.tags || []).map(tag=>String(tag).trim().toLowerCase()).filter(Boolean))]
import { formatDb, gainToVolumePercent } from "./studio-gain"
import type { AudioSelection, AudioSourceWindow } from "../audio-source-editor"
type SourceEditorProps = Omit<ComponentProps<typeof AudioSelection>,"peaks">

import "./music-inspector.css"

function technicalSummary(file: InspectorFile | undefined, sourceDuration: number) {
  const facts = [formatDuration(sourceDuration)]
  if (file?.audio_format) facts.push(String(file.audio_format).toUpperCase())
  if (file?.sample_rate) facts.push(`${(Number(file.sample_rate) / 1000).toFixed(Number(file.sample_rate) % 1000 ? 1 : 0)} kHz`)
  if (file?.channels) facts.push(Number(file.channels) === 1 ? "Mono" : Number(file.channels) === 2 ? "Stereo" : `${file.channels} channels`)
  return facts.join(" · ")
}

export function AudioClipInspector({ track, clip, file, playingKey, playing, onPlay, onClipChange, onClipCommit, onTrackMixChange, onTrackMixCommit, onChoose, disabled = false, sourceAudition, renderSourceEditor, effectsEditor, timingEditor, locale = "en" }: {
  track: SoundSceneTrack
  clip: SoundSceneClip | null
  file?: InspectorFile
  playingKey?: string
  playing: boolean
  onPlay: (source: PlayerSource) => void
  onClipChange: (changes: Partial<SoundSceneClip>) => void
  onClipCommit: () => void | Promise<void>
  onTrackMixChange: (mix: AudioVolumeMix) => void
  onTrackMixCommit: (mix: AudioVolumeMix) => void | Promise<void>
  onChoose?: () => void
  disabled?: boolean
  sourceAudition?: ReactNode
  renderSourceEditor: (props: SourceEditorProps) => ReactNode
  locale?: InspectorLocale
  timingEditor?: ReactNode
  effectsEditor?: ReactNode
}) {
  const t=(text:string)=>inspectorText(locale,text)
  const [start, setStart] = useState((clip?.source_offset_ms ?? 0) / 1000)
  const [windowDuration, setWindowDuration] = useState((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000)
  const [fadeIn, setFadeIn] = useState((clip?.fade_in_ms ?? 0) / 1000)
  const [fadeOut, setFadeOut] = useState((clip?.fade_out_ms ?? 0) / 1000)
  const [duckAmountDb, setDuckAmountDb] = useState(clip?.duck_amount_db ?? -12)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  useEffect(() => setStart((clip?.source_offset_ms ?? 0) / 1000), [clip?.source_offset_ms, clip?.id])
  useEffect(() => setWindowDuration((clip?.duration_ms ?? clip?.resolved_duration_ms ?? 0) / 1000), [clip?.duration_ms, clip?.resolved_duration_ms, clip?.id])
  useEffect(() => setFadeIn((clip?.fade_in_ms ?? 0) / 1000), [clip?.fade_in_ms, clip?.id])
  useEffect(() => setFadeOut((clip?.fade_out_ms ?? 0) / 1000), [clip?.fade_out_ms, clip?.id])
  useEffect(() => setDuckAmountDb(clip?.duck_amount_db ?? -12), [clip?.duck_amount_db, clip?.id])

  function save(label: string, action: () => void | Promise<void>) {
    setError("")
    const failed=(reason:unknown)=>setError(reason instanceof Error ? reason.message : t("Those audio settings could not be saved."))
    try { const result=action(); if(result){setSaving(label);return result.catch(failed).finally(()=>setSaving(""))} }
    catch(reason){failed(reason)}
  }

  function sourceWindow(next: AudioSourceWindow) {
    setStart(next.sourceOffsetMs / 1000)
    if (next.durationMs !== null) setWindowDuration(next.durationMs / 1000)
    onClipChange({ source_offset_ms: next.sourceOffsetMs, duration_ms: next.durationMs })
  }

  if (!clip || !(clip.filename || clip.sourceUrl)) return <div className="music-workbench-empty"><Music2 /><span><b>{t("No audio")}</b><p>{t("Add one reusable audio File to this track.")}</p></span>{onChoose && <Button disabled={disabled} onClick={onChoose}>{t("Choose audio")}</Button>}</div>

  const key = `file-source:${clip.file_id}`
  const active = playing && playingKey === key
  const sourceDuration = Math.max(Number(file?.duration_ms || clip.source_duration_ms || clip.duration_ms || clip.resolved_duration_ms || 0) / 1000, 0.1)
  const usedDuration = Math.max(windowDuration, .1)
  const geometryLocked = disabled || Boolean(clip.locked)
  const clipVolume = clip.muted || clip.gain <= 0 ? 0 : gainToVolumePercent(clip.gain)
  const trackVolume = track.muted || track.volume <= 0 ? 0 : gainToVolumePercent(track.volume)
  const outputVolume = clipVolume === 0 || trackVolume === 0 ? 0 : Math.round(clip.gain * track.volume * 100)
  const category = audioFileFamily(file || { category: clip.file_kind })
  const usage = audioUsageTags(file).find((tag) => tag === "intro" || tag === "outro" || tag === "jingle" || tag === "stinger")
  const duckAmountLabel = duckAmountDb === 0 ? t("No reduction") : formatDb(duckAmountDb)
  const placement = `${t("Starts")} ${formatDuration(Number(clip.resolved_start_ms || 0) / 1000)} · ${clip.loop ? t("Loops to fill its placement") : `${t("Uses")} ${formatDuration(usedDuration)}`}`

  function setDucking(ducking: boolean) {
    const nextAmount = ducking && duckAmountDb === 0 ? -12 : duckAmountDb
    if (nextAmount !== duckAmountDb) setDuckAmountDb(nextAmount)
    onClipChange({ ducking, ...(ducking ? { duck_amount_db: nextAmount } : {}) })
    void save("auto-duck", onClipCommit)
  }

  return <div className="music-workbench-content" data-category={category}>
    <section className="music-workbench-source">
      <span className="music-workbench-art"><SoundMediaIcon kind={category} /></span>
      <div><span className="eyebrow">{t(AUDIO_FAMILY_LABELS[category])}{usage ? ` · ${usage}` : ""}</span><h3>{file?.title || file?.name || clip.file_name || t("Audio")}</h3><p>{file ? `${fileSourceLine(file)} · ${technicalSummary(file, sourceDuration)}` : technicalSummary(file, sourceDuration)}</p></div>
      {sourceAudition ?? <OperatorIconButton label={active ? "Pause audio audition" : "Play audio audition"} detail="Auditions the source without changing its timeline placement." variant="outline" size="icon" onClick={() => onPlay({ key, url: soundClipSourceUrl(clip), title: clip.file_name || t("Audio"), subtitle: "Source audition", kind: "file" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>}
    </section>

    <OperatorInspectorSection icon={Clock3} title={t("Source & timing")} meta={t("Live preview")} help={t("Drag the source window to choose which part of the reusable file this placement uses.")} className="music-workbench-section">
      <p className="music-section-context">{placement}</p>
      {timingEditor}
      {renderSourceEditor({ url:soundClipSourceUrl(clip), sourceDuration, sourceOffset:start, usedDuration, loop:Boolean(clip.loop), disabled:Boolean(saving)||geometryLocked, onChange:sourceWindow, onCommit:next=>{sourceWindow(next);void save("source window",onClipCommit)} })}
    </OperatorInspectorSection>

    <OperatorInspectorSection icon={SlidersHorizontal} title={t("Volume")} meta={`${clipVolume}%`} metaTechnical help={t("Clip volume affects this placement. Track volume affects every clip on the same track.")} className="music-workbench-section music-level-section">
      <AudioVolumeControl locale={locale} label={t("Clip volume")} gain={clip.gain} muted={clip.muted} disabled={disabled || Boolean(saving)} onPreview={({ gain, muted }) => onClipChange({ gain, muted })} onCommit={({ gain, muted }) => { onClipChange({ gain, muted }); return save("clip volume", onClipCommit) }} />
      <p className="music-output-fact">{t("Output")} {outputVolume}% <span>{t("Clip")} {clipVolume}% × {t("Track")} {trackVolume}%</span></p>
      <Collapsible className="music-advanced-level">
        <CollapsibleTrigger><span>{t("Track volume")}</span><b>{trackVolume}%</b><ChevronDown /></CollapsibleTrigger>
        <CollapsibleContent><AudioVolumeControl locale={locale} label={t("Track volume")} gain={track.volume} muted={track.muted} disabled={disabled || Boolean(saving)} onPreview={onTrackMixChange} onCommit={(mix) => save("track volume", () => onTrackMixCommit(mix))} /><p>{t("Changes every clip placed on this track.")}</p></CollapsibleContent>
      </Collapsible>
    </OperatorInspectorSection>

    <OperatorInspectorSection icon={Blend} title={t("Shape")} help={t("Control the clip entrance, exit, looping and how it yields beneath narration.")} className="music-workbench-section">
      <div className="music-fade-grid">
        <label><span>{t("Fade in")} <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label={t("Audio fade in")} disabled={Boolean(saving) || geometryLocked} value={[fadeIn]} max={Math.max(.1,usedDuration)} step={0.1} onValueChange={([value = 0]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeIn]) => { setFadeIn(value); onClipChange({ fade_in_ms: Math.round(value * 1000) }); void save("fade in", onClipCommit) }} /></label>
        <label><span>{t("Fade out")} <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label={t("Audio fade out")} disabled={Boolean(saving) || geometryLocked} value={[fadeOut]} max={Math.max(.1,usedDuration)} step={0.1} onValueChange={([value = 0]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }) }} onValueCommit={([value = fadeOut]) => { setFadeOut(value); onClipChange({ fade_out_ms: Math.round(value * 1000) }); void save("fade out", onClipCommit) }} /></label>
      </div>
      <div className="music-behavior-list">
        <label className="music-behavior-row"><span><b>{t("Loop source")}</b><small>{t("Repeat this source for the full placement.")}</small></span><Switch aria-label={t("Loop source")} checked={Boolean(clip.loop)} disabled={Boolean(saving) || geometryLocked} onCheckedChange={(loop) => { onClipChange({ loop }); void save("looping", onClipCommit) }} /></label>
        <div className="music-duck-control">
          <label className="music-behavior-row"><span><b>{t("Auto-duck under voice")} <OperatorTooltip label={t("How auto-duck works")} detail={t("Only this clip is lowered while narration is audible. It returns to its normal level between spoken Parts.")}><button type="button" className="music-help" aria-label={t("Explain auto-duck")}><CircleHelp /></button></OperatorTooltip></b><small>{clip.ducking ? `${t("During narration")}: ${duckAmountLabel}` : t("Keep the clip at its normal level.")}</small></span><Switch aria-label={t("Auto-duck under voice")} checked={Boolean(clip.ducking)} disabled={disabled || Boolean(saving)} onCheckedChange={setDucking} /></label>
          {clip.ducking && <label className="music-duck-amount"><span>{t("During narration")} <b>{duckAmountLabel}</b></span><Slider aria-label={t("Speech reduction")} disabled={disabled || Boolean(saving)} value={[duckAmountDb]} min={-30} max={0} step={1} onValueChange={([value = -12]) => { setDuckAmountDb(value); onClipChange({ duck_amount_db: value }) }} onValueCommit={([value = duckAmountDb]) => { setDuckAmountDb(value); onClipChange({ duck_amount_db: value }); void save("duck amount", onClipCommit) }} /></label>}
        </div>
      </div>
      {error?<FeedbackMessage tone="error" announce>{error}</FeedbackMessage>:<p className="music-save-state" role="status" aria-live="polite">{saving ? `${t("Saving")}…` : t("Changes save on release")}</p>}
    </OperatorInspectorSection>

    {effectsEditor}
    {clip.locked && !disabled && <p className="music-lock-note">{t("Timing is locked. Volume and effects remain available.")}</p>}
    {onChoose && <section className="music-workbench-actions"><Button variant="outline" disabled={Boolean(saving) || geometryLocked} onClick={onChoose}><RefreshCcw /> {t("Replace source")} </Button></section>}
  </div>
}
