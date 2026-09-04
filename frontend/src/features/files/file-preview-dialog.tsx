import { Download, Plus } from "lucide-react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { WorkspaceFile } from "@/types/domain"
import { FilePreviewMedia } from "./file-preview-media"
import { fileDetailGroups, fileDisplayName, fileDisplayUrl, fileDownloadName, fileKind, fileKindLabel } from "./file-presentation"

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
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="creator-library-preview-dialog">
      <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{label} · {details.origin[0]?.value || "File"}</DialogDescription></DialogHeader>
      <div className="creator-library-preview-layout">
        <div className={`creator-library-preview-media is-${kind}`}><FilePreviewMedia file={file} kind={kind} label={label} name={name} url={url} /></div>
        <aside className="creator-library-preview-details" aria-label="File details">
          <div className="creator-library-preview-actions">
            {onPrimaryAction && <ActionButton className="creator-library-preview-action" busy={pending} busyLabel={`${primaryLabel}…`} onClick={() => onPrimaryAction(file)}><Plus data-icon="inline-start" />{primaryLabel}</ActionButton>}
            {url && <Button variant="outline" asChild><a href={url} download={fileDownloadName(file)} aria-label={`Download ${name}`}><Download />Download</a></Button>}
          </div>
          {Object.entries(details).map(([title, items]) => items.length ? <section key={title}><h3>{title.charAt(0).toUpperCase() + title.slice(1)}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section> : null)}
        </aside>
      </div>
    </DialogContent>
  </Dialog>
}
