import { Check, WandSparkles } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { AudioSourceEditor } from "@/features/sound-scene/source-editor/music-source-editor"
import type { VoicePackageRoute } from "@/types/domain"

export type VoiceSourceDraft = {
  startMs: number
  durationMs: number
  transcript: string
  preprocess: boolean
}

function seconds(value: number | undefined, fallback: number) {
  return Math.round((value ?? fallback) / 1000)
}

export function routeSourceGuidance(route: VoicePackageRoute) {
  const contract = route.clone_source_duration_ms || {}
  return {
    minimumMs: contract.minimum ?? 5_000,
    recommendedMinimumMs: contract.recommended_minimum ?? 10_000,
    recommendedMaximumMs: contract.recommended_maximum ?? 20_000,
    maximumMs: contract.maximum ?? 60_000,
  }
}

export function VoiceMethodSourceEditor({
  route,
  referenceId,
  sourceDurationMs,
  value,
  onChange,
}: {
  route: VoicePackageRoute
  referenceId: string
  sourceDurationMs: number
  value: VoiceSourceDraft
  onChange: (next: VoiceSourceDraft) => void
}) {
  const guidance = routeSourceGuidance(route)
  const needsTranscript = route.adapter_key === "qwen_tts"
  const supportsCleanup = route.adapter_key === "audio"
  const inRecommendedRange = value.durationMs >= guidance.recommendedMinimumMs
    && value.durationMs <= guidance.recommendedMaximumMs

  return <div className="voice-method-source-editor">
    <div className="voice-method-source-guidance">
      <span><Check /> One clear speaker</span>
      <span><Check /> No music or other voices</span>
      <span className={inRecommendedRange ? "recommended" : ""}>
        <Check /> Recommended {seconds(guidance.recommendedMinimumMs, 10_000)}–{seconds(guidance.recommendedMaximumMs, 20_000)} seconds
      </span>
      <small>Allowed {seconds(guidance.minimumMs, 5_000)}–{seconds(guidance.maximumMs, 60_000)} seconds for this method.</small>
    </div>
    <AudioSourceEditor
      url={`/api/v1/voice-references/${encodeURIComponent(referenceId)}/audio`}
      peaksUrl={`/api/v1/voice-references/${encodeURIComponent(referenceId)}/peaks`}
      sourceDuration={sourceDurationMs / 1000}
      sourceOffset={value.startMs / 1000}
      usedDuration={value.durationMs / 1000}
      loop={false}
      onChange={(window) => onChange({ ...value, startMs: window.sourceOffsetMs, durationMs: window.durationMs || value.durationMs })}
      onCommit={(window) => onChange({ ...value, startMs: window.sourceOffsetMs, durationMs: window.durationMs || value.durationMs })}
    />
    {needsTranscript && <label className="voice-method-transcript">
      <span>Exact words in this selection</span>
      <Textarea
        value={value.transcript}
        onChange={(event) => onChange({ ...value, transcript: event.target.value })}
        placeholder="Paste exactly what the speaker says in this selected window"
      />
      <small>Qwen3 uses this transcript to preserve pronunciation and identity.</small>
    </label>}
    {supportsCleanup && <label className="voice-method-cleanup">
      <Checkbox checked={value.preprocess} onCheckedChange={(checked) => onChange({ ...value, preprocess: checked === true })} />
      <WandSparkles />
      <span><b>Clean a noisy recording</b><small>Leave off for clean studio audio. Turn on only for room noise or interference.</small></span>
    </label>}
  </div>
}
