import { AlertCircle, FileArchive, FileAudio, FileText, Image, LoaderCircle, RotateCcw, Upload, Video, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"

export type ProductionLibraryUploadItem = {
  id: string
  file: File
  previewUrl: string | null
  status: "queued" | "uploading" | "attaching" | "failed"
  error?: string
  fileId?: number
}

export function ProductionLibraryUploadCard({ item, onRetry, onDismiss }: {
  item: ProductionLibraryUploadItem
  onRetry: (item: ProductionLibraryUploadItem) => void
  onDismiss: (item: ProductionLibraryUploadItem) => void
}) {
  const failed = item.status === "failed"
  const video = item.file.type.startsWith("video/")
  const image = item.file.type.startsWith("image/")
  const audio = item.file.type.startsWith("audio/")
  const archive = /\.(?:zip|json|csv)$/i.test(item.file.name)
  const KindIcon = video ? Video : image ? Image : audio ? FileAudio : archive ? FileArchive : FileText
  const kindLabel = video ? "Video" : image ? "Image" : audio ? "Audio" : archive ? "Data" : "File"
  const label = item.status === "queued"
    ? "Waiting to upload"
    : item.status === "attaching"
      ? "Adding to Production…"
      : failed
        ? "Upload needs attention"
        : "Uploading…"
  return <article className="production-library-upload-card" data-status={item.status}>
    <div className="production-library-upload-preview">
      {item.previewUrl
        ? video
          ? <video src={item.previewUrl} muted preload="metadata" playsInline />
          : <img src={item.previewUrl} alt="" />
        : <div className="production-library-upload-file-icon"><KindIcon /></div>}
      <span className="production-library-upload-kind"><KindIcon />{kindLabel}</span>
      <span className="production-library-upload-origin"><Upload />Upload</span>
      <span className="production-library-upload-state">{failed ? <AlertCircle /> : <LoaderCircle className="spin" />}{label}</span>
    </div>
    <footer>
      <div><h3 title={item.file.name}>{item.file.name}</h3><p>{failed ? item.error : "It will appear here when ready."}</p></div>
      <div className="production-library-upload-actions">
        {failed && <><OperatorIconButton label={`Retry ${item.file.name}`} size="icon-sm" onClick={() => onRetry(item)}><RotateCcw /></OperatorIconButton><OperatorIconButton label={`Dismiss ${item.file.name}`} detail="If the upload completed, its reusable File remains in the Workspace Library." size="icon-sm" variant="ghost" onClick={() => onDismiss(item)}><X /></OperatorIconButton></>}
      </div>
    </footer>
  </article>
}
