import { AlertCircle, CheckCircle2, LoaderCircle, Pause, Play, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { VoiceIdentity } from "@/components/voice-identity"
import { formatDuration, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VoiceDirectory } from "@/types/domain"

import "./recording-clip-card.css"

export type RecordingClipView = {
  id: string
  status: "pending" | "ready" | "warning" | "review" | "continued" | "outdated" | "failed" | "current"
  voice?: string
  voiceIdentityId?: string | null
  createdAt?: string | null
  durationMs?: number
  cost?: number
  costBasis?: string
  language?: string
  method?: string
  engine?: string
  model?: string
  modelId?: string
  audioUrl?: string | null
  message?: string
  script?: string
  statusLabel?: string
  inputState?: string | null
}

export function RecordingClipCard({ clip, directory, active = false, onPlay, onSecondaryAction, secondaryLabel = "Record again" }: {
  clip: RecordingClipView
  directory: VoiceDirectory
  active?: boolean
  onPlay?: () => void
  onSecondaryAction?: () => void
  secondaryLabel?: string
}) {
  const working = clip.status === "pending"
  const failed = clip.status === "failed"
  const review = clip.status === "review"
  const outdated = clip.status === "outdated"
  const StatusIcon = working ? LoaderCircle : failed || outdated || review ? AlertCircle : CheckCircle2
  const statusLabel = clip.statusLabel || (working ? "Generating" : failed ? "Generation failed" : review ? "Review required" : clip.status === "continued" ? "Cost confirmed · continued" : outdated ? "Outdated" : clip.status === "warning" ? "Ready · review wording" : clip.status === "current" ? "Current recording" : "Ready")
  const created = clip.createdAt ? new Date(clip.createdAt).toLocaleString() : ""

  return <article className={cn("recording-clip-card", `is-${outdated || review ? "warning" : clip.status}`)}>
    <div className="recording-clip-status"><b>Recording</b><StatusIcon className={working ? "spin" : ""} /><span>{statusLabel}</span>{clip.inputState && <em>Rendered from {clip.inputState}</em>}</div>
    <VoiceIdentity voice={clip.voice} identityId={clip.voiceIdentityId} directory={directory} compact showDetail={false} />
    <div className="recording-clip-summary">
      <b>{[clip.method, clip.language].filter(Boolean).join(" · ")}</b>
      <SpeechModelIdentity engine={clip.engine} model={clip.model} modelId={clip.modelId} config={directory.config} compact />
      <small>{[
        clip.durationMs ? formatDuration(clip.durationMs / 1000) : "",
        clip.cost !== undefined ? formatMoney(clip.cost) : "",
        created,
      ].filter(Boolean).join(" · ")}</small>
      {clip.message && <p>{clip.message}</p>}
      {clip.script && <p className="recording-clip-script" dir="auto">{clip.script}</p>}
    </div>
    <div className="recording-clip-actions">
      {clip.audioUrl && onPlay && <Button variant="outline" size="icon" aria-label={active ? "Pause recording" : "Play recording"} onClick={onPlay}>{active ? <Pause /> : <Play />}</Button>}
      {onSecondaryAction && <Button variant="outline" onClick={onSecondaryAction}><RotateCw /> {secondaryLabel}</Button>}
    </div>
  </article>
}
