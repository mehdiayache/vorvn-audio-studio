import { Check, Copy, Download, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { WorkspaceFile } from "@/types/domain"
import { FilePreviewMedia } from "./file-preview-media"
import { fileDetailGroups, fileDisplayName, fileDisplayUrl, fileDownloadName, fileKind, fileKindLabel } from "./file-presentation"
import { useFileTextPreview } from "./file-text-preview"

import "./file-preview-dialog.css"

type FilePreviewDialogProps = {
  file: WorkspaceFile | null
  pending?: boolean
  primaryLabel?: string
  onPrimaryAction?: (file: WorkspaceFile) => void
  onOpenChange: (open: boolean) => void
}

export function FilePreviewDialog(props: FilePreviewDialogProps) {
  if (!props.file) return null
  return <OpenFilePreviewDialog {...props} file={props.file} key={props.file.id} />
}

function OpenFilePreviewDialog({ file, pending = false, primaryLabel = "Use File", onPrimaryAction, onOpenChange }: Omit<FilePreviewDialogProps, "file"> & { file: WorkspaceFile }) {
  const [copied, setCopied] = useState(false)
  const name = fileDisplayName(file)
  const kind = fileKind(file)
  const label = fileKindLabel(kind)
  const url = fileDisplayUrl(file)
  const details = fileDetailGroups(file)
  const textPreview = useFileTextPreview(file, url)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1_600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyText = async () => {
    if (textPreview?.status !== "ready") return
    try {
      await navigator.clipboard.writeText(textPreview.text)
      setCopied(true)
    } catch (reason) {
      toast.error("The File content could not be copied.", {
        description: reason instanceof Error ? reason.message : undefined,
      })
    }
  }

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="creator-library-preview-dialog">
      <DialogHeader className="creator-library-preview-header">
        <div className="creator-library-preview-heading"><DialogTitle>{name}</DialogTitle><DialogDescription>{label} · {details.origin[0]?.value || "File"}</DialogDescription></div>
        <div className="creator-library-preview-toolbar" role="toolbar" aria-label="File actions">
          {textPreview?.status === "ready" && <OperatorIconButton label={copied ? "Copied" : "Copy"} detail="Copy File content" side="bottom" variant="ghost" onClick={() => void copyText()}>{copied ? <Check /> : <Copy />}</OperatorIconButton>}
          {url && <Button size="sm" variant="outline" asChild><a href={url} download={fileDownloadName(file)} aria-label={`Download ${name}`}><Download />Download</a></Button>}
          {onPrimaryAction && <ActionButton size="sm" busy={pending} busyLabel={`${primaryLabel}…`} onClick={() => onPrimaryAction(file)}><Plus data-icon="inline-start" />{primaryLabel}</ActionButton>}
        </div>
      </DialogHeader>
      <div className="creator-library-preview-layout">
        <div className={`creator-library-preview-media is-${kind}`}><FilePreviewMedia file={file} kind={kind} label={label} name={name} url={url} textPreview={textPreview} /></div>
        <aside className="creator-library-preview-details" aria-label="File details">
          {Object.entries(details).map(([title, items]) => items.length ? <section key={title}><h3>{title.charAt(0).toUpperCase() + title.slice(1)}</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section> : null)}
        </aside>
      </div>
    </DialogContent>
  </Dialog>
}
