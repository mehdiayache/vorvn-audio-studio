import type { WorkspaceFile } from "@/types/domain"
import {
  fileDetailGroups, fileDisplayName, fileDisplayUrl, filePlaybackUrl,
  filePosterUrl, formatFileBytes,
} from "@/features/creator/library/file-presentation"

export function isVisualFile(file: WorkspaceFile) {
  return file.media_type === "image" || file.media_type === "video"
}

export function visualFileName(file: WorkspaceFile) {
  return fileDisplayName(file)
}

export function visualFileUrl(file: WorkspaceFile) {
  return fileDisplayUrl(file)
}

export function visualFilePosterUrl(file: WorkspaceFile) {
  return filePosterUrl(file)
}

export function visualFilePlaybackUrl(file: WorkspaceFile) {
  return filePlaybackUrl(file)
}

export function visualFileFacts(file: WorkspaceFile) {
  const dimensions = file.width && file.height ? `${file.width} × ${file.height}` : "Dimensions unavailable"
  const duration = file.media_type === "video" && file.duration_ms
    ? `${Math.round(file.duration_ms / 100) / 10}s`
    : null
  return {
    dimensions,
    duration,
    format: String(file.media_format || file.mime_type?.split("/")[1] || file.media_type || "media").toUpperCase(),
  }
}

export function formatVisualBytes(value?: number | null) {
  return formatFileBytes(value)
}

export function visualFileDetails(file: WorkspaceFile) {
  return fileDetailGroups(file)
}

export const visualFileAccept = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
export const visualUploadLimitBytes = 1_000_000_000
export const visualUploadHint = "JPG, PNG, WebP, MP4, MOV or WebM · up to 1 GB each"

const visualMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
])
const visualExtensions = /\.(?:jpe?g|png|webp|mp4|mov|webm)$/i

export function acceptedVisualFiles(files: FileList | File[]) {
  return Array.from(files).filter((file) => !visualFileIssue(file))
}

export function visualFileIssue(file: File) {
  if (!(visualMimeTypes.has(file.type) || visualExtensions.test(file.name))) {
    return `${file.name} is not a supported image or video.`
  }
  if (file.size > visualUploadLimitBytes) {
    return `${file.name} is over the 1 GB media limit.`
  }
  return null
}
