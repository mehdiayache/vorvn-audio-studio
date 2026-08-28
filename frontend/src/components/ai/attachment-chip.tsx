import { AlertCircle, AudioLines, FileImage, Film, LoaderCircle, RotateCcw, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export type AttachmentChipStatus = "ready" | "uploading" | "failed"

export function AttachmentChip({ name, role, kind, previewUrl, posterUrl, durationLabel, status = "ready", progress, error, onRetry, onRemove }: {
  name: string
  role: string
  kind: "image" | "video" | "audio"
  previewUrl?: string | null
  posterUrl?: string | null
  durationLabel?: string | null
  status?: AttachmentChipStatus
  progress?: number
  error?: string
  onRetry?: () => void
  onRemove: () => void
}) {
  return <article className={cn("attachment-chip", status === "failed" && "is-failed")} data-status={status}>
    <div className="attachment-chip-preview" aria-hidden="true">
      {kind === "image" && previewUrl ? <img src={previewUrl} alt="" /> : null}
      {kind === "video" && (posterUrl || previewUrl) ? <img src={posterUrl || previewUrl || ""} alt="" /> : null}
      {kind === "audio" ? <AudioLines /> : !previewUrl && !posterUrl ? kind === "video" ? <Film /> : <FileImage /> : null}
      {status === "uploading" && <LoaderCircle className="spin attachment-chip-busy" />}
      {status === "failed" && <AlertCircle className="attachment-chip-busy" />}
    </div>
    <div className="attachment-chip-copy">
      <span className="attachment-chip-role">{role}</span>
      <strong title={name}>{name}</strong>
      {durationLabel && <small>{durationLabel}</small>}
      {status === "uploading" && <Progress value={progress ?? 20} aria-label={`Uploading ${name}`} />}
      {status === "failed" && <small className="attachment-chip-error">{error || "Attachment failed"}</small>}
    </div>
    <div className="attachment-chip-actions">
      {status === "failed" && onRetry && <OperatorIconButton label={`Retry ${name}`} size="icon-xs" onClick={onRetry}><RotateCcw /></OperatorIconButton>}
      <OperatorIconButton label={`Remove ${name}`} size="icon-xs" onClick={onRemove}><X /></OperatorIconButton>
    </div>
  </article>
}
