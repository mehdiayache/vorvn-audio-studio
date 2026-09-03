import { fileProvenance, fileProvenanceDetails, fileSourceLine } from "@/lib/file-provenance"
import type { WorkspaceFile } from "@/types/domain"

export type FileKind = "image" | "video" | "audio" | "speech" | "music" | "sfx" | "document" | "data" | "subtitle" | "other"
export type FileAudioFamily = "audio" | "music" | "sfx" | "ambience"

function normalized(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase()
}

export function fileDisplayName(file: WorkspaceFile) {
  return String(file.name || file.title || file.filename || "Untitled File")
}

export function fileKind(file: WorkspaceFile): FileKind {
  if (file.media_type === "image" || file.media_type === "video") return file.media_type
  const category = normalized(file.category || file.file_category)
  const tags = new Set((file.tags || []).map(normalized))
  const filename = normalized(file.filename)
  const mimeType = normalized(file.mime_type)
  if (file.media_type === "subtitle" || mimeType.includes("subtitle") || /\.(srt|vtt)$/.test(filename) || tags.has("subtitle")) return "subtitle"
  if (file.media_type === "document") return "document"
  if (file.media_type === "data" || file.media_type === "archive") return "data"
  if (category === "music" || category === "intro" || category === "outro") return "music"
  if (category === "sfx" || category === "ambience") return "sfx"
  if (category === "speech" || tags.has("speech") || tags.has("voice")) return "speech"
  if (file.media_type === "audio") return "audio"
  return "other"
}

export function fileKindLabel(kind: FileKind) {
  if (kind === "sfx") return "Sound Effect"
  return kind === "other" ? "File" : kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function fileDisplayUrl(file: WorkspaceFile) {
  if (file.url) return file.url
  if (!file.filename) return ""
  return `/${file.media_type === "audio" ? "audio" : "media"}/${encodeURIComponent(file.filename)}`
}

export function filePosterUrl(file: WorkspaceFile) {
  if (file.media_type !== "video" || !file.filename) return fileDisplayUrl(file)
  return `/api/v1/media/video-poster/${encodeURIComponent(file.filename)}`
}

export function filePlaybackUrl(file: WorkspaceFile) {
  if (file.media_type !== "video" || !file.filename) return fileDisplayUrl(file)
  const format = String(file.media_format || "").toLowerCase()
  const codec = String(file.video_codec || "").toLowerCase()
  return format === "mp4" && codec === "h264"
    ? fileDisplayUrl(file)
    : `/api/v1/media/video-proxy/${encodeURIComponent(file.filename)}`
}

export function formatFileBytes(value?: number | null) {
  if (!value || value < 0) return null
  const units = ["B", "KB", "MB", "GB"]
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1 }
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatFileDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

export function fileFacts(file: WorkspaceFile) {
  const kind = fileKind(file)
  const category = normalized(file.category)
  const audioFamily: FileAudioFamily = category === "music" || category === "intro" || category === "outro"
    ? "music"
    : category === "sfx" || category === "ambience"
      ? category
      : "audio"
  const format = String(file.media_format || file.audio_format || file.mime_type?.split("/")[1] || file.media_type || "file").toUpperCase()
  return {
    kind,
    kindLabel: kind === "sfx" && audioFamily === "ambience" ? "Ambience" : fileKindLabel(kind),
    audioFamily,
    duration: file.duration_ms ? `${Math.round(file.duration_ms / 100) / 10}s` : null,
    dimensions: file.width && file.height ? `${file.width} × ${file.height}` : null,
    format,
    category: file.category ? String(file.category) : null,
    tags: [...new Set((file.tags || []).map((tag) => String(tag).trim().toLocaleLowerCase()).filter(Boolean))],
    provenance: fileProvenance(file),
  }
}

export function fileDetailGroups(file: WorkspaceFile) {
  const sourceMetadata = { ...(file.metadata || {}), ...(file.version_metadata || {}) }
  const audioCodec = typeof sourceMetadata.audio_codec === "string" ? sourceMetadata.audio_codec.toUpperCase() : null
  const channelLabel = file.channels ? file.channels === 1 ? "Mono" : file.channels === 2 ? "Stereo" : `${file.channels} channels` : null
  const technical = [
    { label: "Dimensions", value: file.width && file.height ? `${file.width} × ${file.height}` : null },
    { label: "Duration", value: file.duration_ms ? `${Math.round(file.duration_ms / 100) / 10}s` : null },
    { label: "Format", value: String(file.media_format || file.audio_format || file.mime_type?.split("/")[1] || file.media_type || "").toUpperCase() || null },
    { label: "Codec", value: file.video_codec ? String(file.video_codec).toUpperCase() : audioCodec },
    { label: "Frame rate", value: file.frame_rate ? `${Math.round(file.frame_rate * 100) / 100} fps` : null },
    { label: "Channels", value: channelLabel },
    { label: "Sample rate", value: file.sample_rate ? `${Math.round(file.sample_rate / 100) / 10} kHz` : null },
    { label: "File size", value: formatFileBytes(file.size_bytes) },
    { label: "MIME type", value: file.mime_type || null },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  const library = [
    { label: "Category", value: file.category ? String(file.category) : null },
    { label: "Folder", value: file.folder || (file.folder_id ? `Folder ${file.folder_id}` : "Workspace root") },
    { label: "Tags", value: file.tags?.length ? file.tags.join(", ") : null },
    { label: "Added", value: formatFileDate(file.created_at) },
    { label: "Updated", value: formatFileDate(file.updated_at) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  const origin = [
    { label: "Source", value: fileSourceLine(file) },
    ...fileProvenanceDetails(file).map(({ label, value }) => ({ label, value })),
  ]
  return { origin, technical, library }
}

export function isVisualFile(file: WorkspaceFile) {
  const kind = fileKind(file)
  return kind === "image" || kind === "video"
}

export function visualFileName(file: WorkspaceFile) { return fileDisplayName(file) }
export function visualFileUrl(file: WorkspaceFile) { return fileDisplayUrl(file) }
export function visualFilePosterUrl(file: WorkspaceFile) { return filePosterUrl(file) }
export function visualFilePlaybackUrl(file: WorkspaceFile) { return filePlaybackUrl(file) }
export function visualFileFacts(file: WorkspaceFile) {
  const facts = fileFacts(file)
  return {
    dimensions: facts.dimensions || "Dimensions unavailable",
    duration: file.media_type === "video" ? facts.duration : null,
    format: facts.format,
  }
}
export function formatVisualBytes(value?: number | null) { return formatFileBytes(value) }
export function visualFileDetails(file: WorkspaceFile) { return fileDetailGroups(file) }

export const visualFileAccept = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
export const visualUploadLimitBytes = 1_000_000_000
export const visualUploadHint = "JPG, PNG, WebP, MP4, MOV or WebM · up to 1 GB each"

const visualMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"])
const visualExtensions = /\.(?:jpe?g|png|webp|mp4|mov|webm)$/i

export function acceptedVisualFiles(files: FileList | File[]) {
  return Array.from(files).filter((file) => !visualFileIssue(file))
}

export function visualFileIssue(file: File) {
  if (!(visualMimeTypes.has(file.type) || visualExtensions.test(file.name))) return `${file.name} is not a supported image or video.`
  if (file.size > visualUploadLimitBytes) return `${file.name} is over the 1 GB media limit.`
  return null
}
