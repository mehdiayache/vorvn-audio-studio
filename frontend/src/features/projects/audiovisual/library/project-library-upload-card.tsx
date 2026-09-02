import { AlertCircle, Image, LoaderCircle, RotateCcw, Upload, Video, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Skeleton } from "@/components/ui/skeleton"

export type ProjectLibraryUploadItem = {
  id: string
  file: File
  previewUrl: string | null
  status: "queued" | "uploading" | "attaching" | "failed"
  error?: string
  fileId?: number
}

export function ProjectLibraryUploadCard({ item, onRetry, onDismiss }: {
  item: ProjectLibraryUploadItem
  onRetry: (item: ProjectLibraryUploadItem) => void
  onDismiss: (item: ProjectLibraryUploadItem) => void
}) {
  const failed = item.status === "failed"
  const video = item.file.type.startsWith("video/")
  const label = item.status === "queued"
    ? "Waiting to upload"
    : item.status === "attaching"
      ? "Adding to Project…"
      : failed
        ? "Upload needs attention"
        : "Uploading…"
  return <article className="visual-file-card project-library-upload-card" data-status={item.status}>
    <div className="visual-file-preview project-library-upload-preview">
      {item.previewUrl
        ? video
          ? <video src={item.previewUrl} muted preload="metadata" playsInline />
          : <img src={item.previewUrl} alt="" />
        : <Skeleton className="project-library-upload-skeleton" />}
      <span className="visual-file-kind">{video ? <Video /> : <Image />}{video ? "Video" : "Image"}</span>
      <span className="visual-file-origin"><Upload />Upload</span>
      <span className="project-library-upload-state">{failed ? <AlertCircle /> : <LoaderCircle className="spin" />}{label}</span>
    </div>
    <footer>
      <div><h3 title={item.file.name}>{item.file.name}</h3><p>{failed ? item.error : "It will appear here when ready."}</p></div>
      <div className="project-library-upload-actions">
        {failed && <><OperatorIconButton label={`Retry ${item.file.name}`} size="icon-sm" onClick={() => onRetry(item)}><RotateCcw /></OperatorIconButton><OperatorIconButton label={`Dismiss ${item.file.name}`} detail="If the upload completed, its reusable File remains in the Workspace Library." size="icon-sm" variant="ghost" onClick={() => onDismiss(item)}><X /></OperatorIconButton></>}
      </div>
    </footer>
  </article>
}
