import {FeedbackMessage} from "../ui/feedback-message"
import {inspectorText,type InspectorLocale} from "./studio-inspector-copy"
import { SlidersHorizontal } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { Slider } from "@/components/ui/slider"
import { formatMediaTime as formatDuration } from "../../lib/media-time"
import type { SequenceMixOverride, SequenceProjectionSpan } from "./studio-timeline-model"
import { SoundMediaIcon } from "./studio-audio-presentation"
import { AudioVolumeControl } from "./audio-volume-control"
import { SoundEffectsEditor } from "./sound-scene-context-toolbar"

import "./sequence-mix-inspector.css"

export function SequenceMixInspector({ span, saving, onPreview, onCommit, textContext, locale = "en", renderSupported = true }: {
  span: SequenceProjectionSpan
  saving: boolean
  onPreview: (changes: Partial<SequenceMixOverride>) => void
  onCommit: (changes: Partial<SequenceMixOverride>) => void | Promise<void>
  textContext?: ReactNode
  locale?: "en" | "fr" | "ar" | "id"
  renderSupported?: boolean
}) {
  const t=(text:string)=>inspectorText(locale,text)
  const [error,setError]=useState("")
  const [committing,setCommitting]=useState(false)
  const save=(changes:Partial<SequenceMixOverride>)=>{setError("");try{const result=onCommit(changes);if(result){setCommitting(true);return result.catch(reason=>setError(reason instanceof Error?reason.message:String(reason))).finally(()=>setCommitting(false))}}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}}
  const [fadeIn, setFadeIn] = useState(span.mix.fade_in_ms / 1_000)
  const [fadeOut, setFadeOut] = useState(span.mix.fade_out_ms / 1_000)
  const maximumFade = Math.max(.1, span.duration_ms / 1_000)
  useEffect(() => setFadeIn(span.mix.fade_in_ms / 1_000), [span.mix.fade_in_ms, span.part_public_id])
  useEffect(() => setFadeOut(span.mix.fade_out_ms / 1_000), [span.mix.fade_out_ms, span.part_public_id])

  return <div className="sequence-mix-inspector">
    <section className="sequence-mix-identity">
      <span><SoundMediaIcon kind="speech" /></span>
      <div><small>{t("Canonical Script audio")}</small><h3>{span.role || span.voice_name || span.title || t("Script Part")}</h3><p>{formatDuration(span.start_ms / 1_000)} · {formatDuration(span.duration_ms / 1_000)}</p></div>
    </section>

    {textContext}
    <OperatorInspectorSection icon={SlidersHorizontal} title={t("Part mix")} help={t("These changes affect Timeline playback and final export without changing Script timing.")} className="sequence-mix-controls">
      <AudioVolumeControl locale={locale} label={t("Part volume")} gain={span.mix.gain} muted={span.mix.muted} disabled={saving||committing} onPreview={({ gain, muted }) => onPreview({ gain, muted })} onCommit={({ gain, muted }) => save({ gain, muted })} />
      <div className="sequence-mix-fades">
        <label><span>{t("Fade in")} <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label={t("Script Part fade in")} disabled={saving||committing} min={0} max={maximumFade} step={.1} value={[fadeIn]} onValueChange={([value = 0]) => { setFadeIn(value); onPreview({ fade_in_ms: Math.round(value * 1_000) }) }} onValueCommit={([value = fadeIn]) => { setFadeIn(value); void save({ fade_in_ms: Math.round(value * 1_000) }) }} /></label>
        <label><span>{t("Fade out")} <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label={t("Script Part fade out")} disabled={saving||committing} min={0} max={maximumFade} step={.1} value={[fadeOut]} onValueChange={([value = 0]) => { setFadeOut(value); onPreview({ fade_out_ms: Math.round(value * 1_000) }) }} onValueCommit={([value = fadeOut]) => { setFadeOut(value); void save({ fade_out_ms: Math.round(value * 1_000) }) }} /></label>
      </div>
    </OperatorInspectorSection>

    <div className="sequence-mix-effects">
      <SoundEffectsEditor
        subject="Part"
        locale={locale}
        renderSupported={renderSupported}
        effects={span.mix.effects}
        disabled={saving||committing}
        onPreview={(effects) => onPreview({ effects })}
        onCommit={(effects) => void save({ effects })}
      />
    </div>
    {error&&<FeedbackMessage tone="error" announce>{error}</FeedbackMessage>}
  </div>
}
