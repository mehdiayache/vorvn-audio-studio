import { AlertCircle, Image, LoaderCircle, RotateCcw, Upload, Video, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Skeleton } from "@/components/ui/skeleton"

export type DirectorUploadItem = {
  id: string
  file: File
  previewUrl: string | null
  status: "queued" | "uploading" | "attaching" | "failed"
  error?: string
  assetId?: number
}

export function DirectorUploadCard({ item, onRetry, onDismiss }: {
  item: DirectorUploadItem
  onRetry: (item: DirectorUploadItem) => void
  onDismiss: (item: DirectorUploadItem) => void
}) {
  const failed = item.status === "failed"
  const video = item.file.type.startsWith("video/")
  const label = item.status === "queued"
    ? "Waiting to upload"
    : item.status === "attaching"
      ? "Adding to Director…"
      : failed
        ? "Upload needs attention"
        : "Uploading…"
  return <article className="visual-asset-card director-upload-card" data-status={item.status}>
    <div className="visual-asset-preview director-upload-preview">
      {item.previewUrl
        ? video
          ? <video src={item.previewUrl} muted preload="metadata" playsInline />
          : <img src={item.previewUrl} alt="" />
        : <Skeleton className="director-upload-skeleton" />}
      <span className="visual-asset-kind">{video ? <Video /> : <Image />}{video ? "Video" : "Image"}</span>
      <span className="visual-asset-origin"><Upload />Upload</span>
      <span className="director-upload-state">{failed ? <AlertCircle /> : <LoaderCircle className="spin" />}{label}</span>
    </div>
    <footer>
      <div><h3 title={item.file.name}>{item.file.name}</h3><p>{failed ? item.error : "It will appear here when ready."}</p></div>
      <div className="director-upload-actions">
        {failed && <><OperatorIconButton label={`Retry ${item.file.name}`} size="icon-sm" onClick={() => onRetry(item)}><RotateCcw /></OperatorIconButton><OperatorIconButton label={`Dismiss ${item.file.name}`} detail="If the upload completed, its reusable Asset remains in the Asset Library." size="icon-sm" variant="ghost" onClick={() => onDismiss(item)}><X /></OperatorIconButton></>}
      </div>
    </footer>
  </article>
}
