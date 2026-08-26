import { AlertCircle, LoaderCircle, RotateCcw, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Skeleton } from "@/components/ui/skeleton"
import type { DirectorGalleryView } from "./director-gallery"

export type DirectorUploadItem = {
  id: string
  file: File
  previewUrl: string | null
  status: "queued" | "uploading" | "attaching" | "failed"
  error?: string
  assetId?: number
}

export function DirectorUploadCard({ item, view = "gallery", onRetry, onDismiss }: {
  item: DirectorUploadItem
  view?: DirectorGalleryView
  onRetry: (item: DirectorUploadItem) => void
  onDismiss: (item: DirectorUploadItem) => void
}) {
  const failed = item.status === "failed"
  const label = item.status === "queued"
    ? "Waiting to upload"
    : item.status === "attaching"
      ? "Adding to Director…"
      : failed
        ? "Upload needs attention"
        : "Uploading…"
  return <article className="visual-asset-card director-upload-card" data-status={item.status} data-view={view}>
    <div className="visual-asset-preview director-upload-preview">
      {item.previewUrl
        ? item.file.type.startsWith("video/")
          ? <video src={item.previewUrl} muted preload="metadata" playsInline />
          : <img src={item.previewUrl} alt="" />
        : <Skeleton className="director-upload-skeleton" />}
      <span className="director-upload-state">{failed ? <AlertCircle /> : <LoaderCircle className="spin" />}{label}</span>
    </div>
    <footer>
      <div><h3 title={item.file.name}>{item.file.name}</h3><p>{failed ? item.error : "It will appear here when ready."}</p></div>
      <div className="director-upload-actions">
        {failed && <><OperatorIconButton label={`Retry ${item.file.name}`} size="icon-sm" onClick={() => onRetry(item)}><RotateCcw /></OperatorIconButton><OperatorIconButton label={`Dismiss ${item.file.name}`} detail="The uploaded file may still be available in Visual Library." size="icon-sm" variant="ghost" onClick={() => onDismiss(item)}><X /></OperatorIconButton></>}
      </div>
    </footer>
  </article>
}
