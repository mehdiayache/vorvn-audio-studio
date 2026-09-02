import { Clock3, Image as ImageIcon, Plus, Video } from "lucide-react"

import { ActionButton } from "@/components/operator-action"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { WorkspaceFile } from "@/types/domain"
import { visualFileDetails, visualFileFacts, visualFileName, visualFilePlaybackUrl, visualFilePosterUrl, visualFileUrl } from "./visual-files"

export function FilePreviewDialog({ file, pending = false, onAddToTimeline, onOpenChange }: { file: WorkspaceFile | null; pending?: boolean; onAddToTimeline?: (file: WorkspaceFile) => void; onOpenChange: (open: boolean) => void }) {
  if (!file) return null
  const name = visualFileName(file)
  const facts = visualFileFacts(file)
  const details = visualFileDetails(file)
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="project-library-preview-dialog">
      <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{file.media_type === "video" ? "Video" : "Image"} · {facts.dimensions} · {facts.format}</DialogDescription></DialogHeader>
      <div className="project-library-preview-layout">
        <div className="project-library-preview-media">{file.media_type === "video" ? <video src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} controls autoPlay playsInline /> : <img src={visualFileUrl(file)} alt={name} />}</div>
        <aside className="project-library-preview-details" aria-label="Media details">
          <div className="project-library-preview-facts"><span>{file.media_type === "video" ? <Video /> : <ImageIcon />}{file.media_type === "video" ? "Video" : "Image"}</span>{facts.duration && <span><Clock3 />{facts.duration}</span>}</div>
          {onAddToTimeline && <ActionButton className="project-library-preview-add" busy={pending} busyLabel="Adding to Timeline…" onClick={() => onAddToTimeline(file)}><Plus data-icon="inline-start" /> Add to Timeline</ActionButton>}
          <DetailSection title="Origin" items={details.origin} />
          <DetailSection title="Technical" items={details.technical} />
          {details.library.length > 0 && <DetailSection title="Library" items={details.library} />}
        </aside>
      </div>
    </DialogContent>
  </Dialog>
}

function DetailSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  if (!items.length) return null
  return <section className="project-library-detail-section"><h3>{title}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}
