import { SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"

import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"
import type { SequenceMixOverride, SequenceProjectionSpan } from "@/types/domain"
import { SoundMediaIcon } from "../sound-media-icon"
import { AudioVolumeControl } from "../components/audio-volume-control"
import { SoundEffectsEditor } from "../timeline/sound-scene-context-toolbar"

import "./sequence-mix-inspector.css"

export function SequenceMixInspector({ span, saving, onPreview, onCommit }: {
  span: SequenceProjectionSpan
  saving: boolean
  onPreview: (changes: Partial<SequenceMixOverride>) => void
  onCommit: (changes: Partial<SequenceMixOverride>) => Promise<void>
}) {
  const [fadeIn, setFadeIn] = useState(span.mix.fade_in_ms / 1_000)
  const [fadeOut, setFadeOut] = useState(span.mix.fade_out_ms / 1_000)
  const maximumFade = Math.max(.1, span.duration_ms / 1_000)
  useEffect(() => setFadeIn(span.mix.fade_in_ms / 1_000), [span.mix.fade_in_ms, span.part_public_id])
  useEffect(() => setFadeOut(span.mix.fade_out_ms / 1_000), [span.mix.fade_out_ms, span.part_public_id])

  return <div className="sequence-mix-inspector">
    <section className="sequence-mix-identity">
      <span><SoundMediaIcon kind="speech" /></span>
      <div><small>Canonical Script audio</small><h3>{span.role || span.voice_name || span.title || "Script Part"}</h3><p>{formatDuration(span.start_ms / 1_000)} · {formatDuration(span.duration_ms / 1_000)}</p></div>
    </section>

    <OperatorInspectorSection icon={SlidersHorizontal} title="Part mix" help="These changes affect Timeline playback and final export without changing Script timing." className="sequence-mix-controls">
      <AudioVolumeControl label="Part volume" gain={span.mix.gain} muted={span.mix.muted} disabled={saving} onPreview={({ gain, muted }) => onPreview({ gain, muted })} onCommit={({ gain, muted }) => onCommit({ gain, muted })} />
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
  </div>
}
