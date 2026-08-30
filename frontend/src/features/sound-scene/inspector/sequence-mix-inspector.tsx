import { AudioLines, ExternalLink, SlidersHorizontal, Volume2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { Slider } from "@/components/ui/slider"
import { SwitchLike } from "@/components/switch-like"
import { formatDuration } from "@/lib/format"
import type { SequenceMixOverride, SequenceProjectionSpan } from "@/types/domain"
import { SoundEffectsEditor } from "../timeline/sound-scene-context-toolbar"

import "./sequence-mix-inspector.css"

function gainToDb(gain: number) {
  return gain <= .001 ? -60 : Math.max(-60, Math.min(6, 20 * Math.log10(gain)))
}

function dbToGain(db: number) {
  return db <= -60 ? 0 : Math.min(2, 10 ** (db / 20))
}

function formatDb(db: number) {
  return db <= -60 ? "−∞ dB" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`
}

export function SequenceMixInspector({ span, saving, onPreview, onCommit, onOpenSequence }: {
  span: SequenceProjectionSpan
  saving: boolean
  onPreview: (changes: Partial<SequenceMixOverride>) => void
  onCommit: (changes: Partial<SequenceMixOverride>) => Promise<void>
  onOpenSequence: () => void
}) {
  const [gainDb, setGainDb] = useState(gainToDb(span.mix.gain))
  const [fadeIn, setFadeIn] = useState(span.mix.fade_in_ms / 1_000)
  const [fadeOut, setFadeOut] = useState(span.mix.fade_out_ms / 1_000)
  const maximumFade = Math.max(.1, span.duration_ms / 1_000)
  useEffect(() => setGainDb(gainToDb(span.mix.gain)), [span.mix.gain, span.part_public_id])
  useEffect(() => setFadeIn(span.mix.fade_in_ms / 1_000), [span.mix.fade_in_ms, span.part_public_id])
  useEffect(() => setFadeOut(span.mix.fade_out_ms / 1_000), [span.mix.fade_out_ms, span.part_public_id])

  return <div className="sequence-mix-inspector">
    <section className="sequence-mix-identity">
      <span><AudioLines /></span>
      <div><small>Canonical Script audio</small><h3>{span.role || span.voice_name || span.title || "Script Part"}</h3><p>{formatDuration(span.start_ms / 1_000)} · {formatDuration(span.duration_ms / 1_000)}</p></div>
    </section>

    <OperatorInspectorSection icon={SlidersHorizontal} title="Part mix" help="These changes affect Timeline playback and final export without changing Script timing." className="sequence-mix-controls">
      <SwitchLike label="Mute Part audio" checked={span.mix.muted} disabled={saving} onChange={(muted) => { onPreview({ muted }); void onCommit({ muted }) }} />
      <label><span><Volume2 /> Gain <b>{formatDb(gainDb)}</b></span><Slider aria-label="Script Part gain" disabled={saving} min={-60} max={6} step={.5} value={[gainDb]} onValueChange={([value = 0]) => { setGainDb(value); onPreview({ gain: dbToGain(value) }) }} onValueCommit={([value = gainDb]) => { setGainDb(value); void onCommit({ gain: dbToGain(value) }) }} /></label>
      <div className="sequence-mix-fades">
        <label><span>Fade in <b>{fadeIn.toFixed(1)}s</b></span><Slider aria-label="Script Part fade in" disabled={saving} min={0} max={maximumFade} step={.1} value={[fadeIn]} onValueChange={([value = 0]) => { setFadeIn(value); onPreview({ fade_in_ms: Math.round(value * 1_000) }) }} onValueCommit={([value = fadeIn]) => { setFadeIn(value); void onCommit({ fade_in_ms: Math.round(value * 1_000) }) }} /></label>
        <label><span>Fade out <b>{fadeOut.toFixed(1)}s</b></span><Slider aria-label="Script Part fade out" disabled={saving} min={0} max={maximumFade} step={.1} value={[fadeOut]} onValueChange={([value = 0]) => { setFadeOut(value); onPreview({ fade_out_ms: Math.round(value * 1_000) }) }} onValueCommit={([value = fadeOut]) => { setFadeOut(value); void onCommit({ fade_out_ms: Math.round(value * 1_000) }) }} /></label>
      </div>
    </OperatorInspectorSection>

    <div className="sequence-mix-effects">
      <SoundEffectsEditor
        subject="Part"
        effects={span.mix.effects}
        disabled={saving}
        onPreview={(effects) => onPreview({ effects })}
        onCommit={(effects) => void onCommit({ effects })}
      />
    </div>

    <div className="sequence-mix-footer"><Button variant="outline" onClick={onOpenSequence}><ExternalLink /> Open in Script</Button></div>
  </div>
}
