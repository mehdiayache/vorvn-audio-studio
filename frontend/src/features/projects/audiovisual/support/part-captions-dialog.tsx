import { PartCaptionPanel } from "@/components/part-caption-panel"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePartDetailData } from "@/hooks/use-part-detail-data"
import { formatDuration } from "@/lib/format"
import type { ProjectPart, VoiceDirectory } from "@/types/domain"

import "@/features/projects/audiovisual/support/project-inspector.css"

export function PartCaptionsDialog({ projectId, part, directory, onOpenChange, onChanged }: {
  projectId: number
  part: ProjectPart | null
  directory: VoiceDirectory
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void>
}) {
  const data = usePartDetailData(projectId, part, onChanged)
  const partNumber = String((part?.position ?? 0) + 1).padStart(2, "0")
  const voice = part?.voice_name || "Recorded speech"
  const duration = formatDuration(Number(part?.duration_ms || 0) / 1000)

  return <Dialog open={Boolean(part)} onOpenChange={onOpenChange}>
    <DialogContent className="part-caption-dialog">
      <DialogHeader className="part-caption-dialog-header">
        <DialogTitle>Captions · Part {partNumber}</DialogTitle>
        <DialogDescription>{voice} · active recording · {duration}</DialogDescription>
      </DialogHeader>
      {part && <div className="part-caption-dialog-body">
        <PartCaptionPanel
          captions={data.captions}
          transcript={data.transcript}
          languages={directory.config?.languages || []}
          sourceLanguage={part.caption_source_language || part.language || undefined}
          loading={data.loading}
          busy={data.captionBusy}
          confirmation={data.captionConfirmation}
          job={data.captionJob}
          onSelect={data.selectTranscript}
          onCreate={data.makeCaptions}
          onTranslate={data.translate}
          onConfirm={data.confirmCaptionAction}
          onCancel={data.cancelCaptionAction}
          onRetryJob={data.retryCaptionJob}
          onDismissJob={data.dismissCaptionJob}
        />
      </div>}
      {data.message && <div className="part-caption-dialog-message" role="status" aria-live="polite">{data.message}</div>}
    </DialogContent>
  </Dialog>
}
