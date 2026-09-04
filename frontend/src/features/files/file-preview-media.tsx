import { Archive, AudioLines, Captions, Clock3, Database, FileText, Image, Video } from "lucide-react"
import { formatDuration } from "@/lib/format"
import type { WorkspaceFile } from "@/types/domain"
import {
  filePlaybackUrl,
  filePosterUrl,
  type FileKind,
} from "./file-presentation"
import { FileTextPreview, type FileTextPreviewModel } from "./file-text-preview"

function FilePreviewFallback({ kind, label }: { kind: FileKind; label: string }) {
  const Icon = kind === "image" ? Image
    : kind === "video" ? Video
      : ["audio", "speech", "music", "sfx"].includes(kind) ? AudioLines
        : kind === "subtitle" ? Captions
          : kind === "data" ? Database
            : kind === "document" ? FileText
              : Archive
  return <div className="file-preview-message"><Icon /><b>{label}</b><p>{kind === "data" ? "This format does not have an inline preview." : "Preview is not available for this File."}</p></div>
}

export function FilePreviewMedia({ file, kind, label, name, url, textPreview }: {
  file: WorkspaceFile
  kind: FileKind
  label: string
  name: string
  url: string
  textPreview?: FileTextPreviewModel | null
}) {
  if (kind === "video" && url) return <video src={filePlaybackUrl(file)} poster={filePosterUrl(file)} controls playsInline />
  if (kind === "image" && url) return <img src={url} alt={name} />
  if (url && (file.mime_type === "application/pdf" || /\.pdf$/i.test(String(file.filename || "")))) {
    return <iframe className="file-pdf-preview" src={url} title={`${name} PDF preview`} />
  }
  if (file.media_type === "audio" && url) return <div className="file-audio-preview">
    <AudioLines />
    <b>{label}</b>
    {file.duration_ms ? <small><Clock3 />{formatDuration(file.duration_ms / 1000)}</small> : null}
    <audio aria-label={`Play ${name}`} src={url} controls preload="metadata" />
  </div>
  if (textPreview) return <FileTextPreview preview={textPreview} />
  return <FilePreviewFallback kind={kind} label={label} />
}
