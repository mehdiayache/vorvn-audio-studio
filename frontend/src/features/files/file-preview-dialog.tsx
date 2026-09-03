import { AudioLines, Clock3, FileText, Image as ImageIcon, Plus, Video } from "lucide-react"

import { ActionButton } from "@/components/operator-action"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDuration } from "@/lib/format"
import type { WorkspaceFile } from "@/types/domain"
import { fileDetailGroups, fileDisplayName, fileDisplayUrl, fileKind, fileKindLabel, filePlaybackUrl, filePosterUrl } from "./file-presentation"

import "./file-preview-dialog.css"

export function FilePreviewDialog({ file, pending = false, primaryLabel = "Use File", onPrimaryAction, onOpenChange }: {
  file: WorkspaceFile | null
  pending?: boolean
  primaryLabel?: string
  onPrimaryAction?: (file: WorkspaceFile) => void
  onOpenChange: (open: boolean) => void
}) {
  if (!file) return null
  const name = fileDisplayName(file)
  const kind = fileKind(file)
  const label = fileKindLabel(kind)
  const url = fileDisplayUrl(file)
  const details = fileDetailGroups(file)
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : kind === "subtitle" || kind === "document" || kind === "data" ? FileText : AudioLines
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="creator-library-preview-dialog">
      <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{label} · {details.origin[0]?.value || "File"}</DialogDescription></DialogHeader>
      <div className="creator-library-preview-layout">
        <div className={`creator-library-preview-media is-${kind}`}>{kind === "video" && url ? <video src={filePlaybackUrl(file)} poster={filePosterUrl(file)} controls playsInline /> : kind === "image" && url ? <img src={url} alt={name} /> : file.media_type === "audio" && url ? <span><Icon /><b>{label}</b>{file.duration_ms ? <small><Clock3 />{formatDuration(file.duration_ms / 1000)}</small> : null}<audio src={url} controls preload="metadata" /></span> : <span><Icon /><b>{label}</b>{file.duration_ms ? <small><Clock3 />{formatDuration(file.duration_ms / 1000)}</small> : null}</span>}</div>
        <aside className="creator-library-preview-details" aria-label="File details">
          {onPrimaryAction && <ActionButton className="creator-library-preview-action" busy={pending} busyLabel={`${primaryLabel}…`} onClick={() => onPrimaryAction(file)}><Plus data-icon="inline-start" />{primaryLabel}</ActionButton>}
          {Object.entries(details).map(([title, items]) => items.length ? <section key={title}><h3>{title.charAt(0).toUpperCase() + title.slice(1)}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section> : null)}
        </aside>
      </div>
    </DialogContent>
  </Dialog>
}
