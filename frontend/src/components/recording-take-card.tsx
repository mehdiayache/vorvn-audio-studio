import { AlertCircle, CheckCircle2, LoaderCircle, Pause, Play, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { VoiceIdentity } from "@/components/voice-identity"
import { formatDuration, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VoiceDirectory } from "@/types/domain"

import "./recording-take-card.css"

export type RecordingTakeView = {
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
}

export function RecordingTakeCard({ take, directory, active = false, onPlay, onSecondaryAction, secondaryLabel = "Another take" }: {
  take: RecordingTakeView
  directory: VoiceDirectory
  active?: boolean
  onPlay?: () => void
  onSecondaryAction?: () => void
  secondaryLabel?: string
}) {
  const working = take.status === "pending"
  const failed = take.status === "failed"
  const review = take.status === "review"
  const outdated = take.status === "outdated"
  const StatusIcon = working ? LoaderCircle : failed || outdated || review ? AlertCircle : CheckCircle2
  const statusLabel = take.statusLabel || (working ? "Generating" : failed ? "Generation failed" : review ? "Review required" : take.status === "continued" ? "Cost confirmed · continued" : outdated ? "Outdated" : take.status === "warning" ? "Ready · review wording" : take.status === "current" ? "Current take" : "Ready")
  const created = take.createdAt ? new Date(take.createdAt).toLocaleString() : ""

  return <article className={cn("recording-take-card", `is-${outdated || review ? "warning" : take.status}`)}>
    <div className="recording-take-status"><StatusIcon className={working ? "spin" : ""} /><span>{statusLabel}</span></div>
    <VoiceIdentity voice={take.voice} identityId={take.voiceIdentityId} directory={directory} compact showDetail={false} />
    <div className="recording-take-summary">
      <b>{[take.method, take.language].filter(Boolean).join(" · ")}</b>
      <SpeechModelIdentity engine={take.engine} model={take.model} modelId={take.modelId} config={directory.config} compact />
      <small>{[
        take.durationMs ? formatDuration(take.durationMs / 1000) : "",
        take.cost !== undefined ? formatMoney(take.cost) : "",
        created,
      ].filter(Boolean).join(" · ")}</small>
      {take.message && <p>{take.message}</p>}
      {take.script && <p className="recording-take-script" dir="auto">{take.script}</p>}
    </div>
    <div className="recording-take-actions">
      {take.audioUrl && onPlay && <Button variant="outline" size="icon" aria-label={active ? "Pause take" : "Play take"} onClick={onPlay}>{active ? <Pause /> : <Play />}</Button>}
      {onSecondaryAction && <Button variant="outline" onClick={onSecondaryAction}><RotateCw /> {secondaryLabel}</Button>}
    </div>
  </article>
}
