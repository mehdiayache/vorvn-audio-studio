import { fileProvenanceDetails, fileSourceLine } from "@/lib/file-provenance"
import type { WorkspaceFile } from "@/types/domain"

export function fileDisplayName(file: WorkspaceFile) {
  return String(file.name || file.title || file.filename || "Untitled File")
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
