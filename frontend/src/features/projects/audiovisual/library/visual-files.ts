import type { WorkspaceFile } from "@/types/domain"
import { fileProvenanceDetails, fileSourceLine } from "@/lib/file-provenance"

export function isVisualFile(file: WorkspaceFile) {
  return file.media_type === "image" || file.media_type === "video"
}

export function visualFileName(file: WorkspaceFile) {
  return String(file.name || file.title || file.filename || "Untitled visual")
}

export function visualFileUrl(file: WorkspaceFile) {
  return file.filename ? `/media/${encodeURIComponent(file.filename)}` : ""
}

export function visualFilePosterUrl(file: WorkspaceFile) {
  if (file.media_type !== "video" || !file.filename) return visualFileUrl(file)
  return `/api/v1/media/video-poster/${encodeURIComponent(file.filename)}`
}

export function visualFilePlaybackUrl(file: WorkspaceFile) {
  if (file.media_type !== "video" || !file.filename) return visualFileUrl(file)
  const format = String(file.media_format || "").toLowerCase()
  const codec = String(file.video_codec || "").toLowerCase()
  return format === "mp4" && codec === "h264"
    ? visualFileUrl(file)
    : `/api/v1/media/video-proxy/${encodeURIComponent(file.filename)}`
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
  if (!value || value < 0) return null
  const units = ["B", "KB", "MB", "GB"]
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  const digits = amount >= 10 || unit === 0 ? 0 : 1
  return `${amount.toFixed(digits)} ${units[unit]}`
}

export function formatVisualDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

export function visualFileDetails(file: WorkspaceFile) {
  const facts = visualFileFacts(file)
  const sourceMetadata = { ...(file.metadata || {}), ...(file.version_metadata || {}) }
  const audioCodec = typeof sourceMetadata.audio_codec === "string" ? sourceMetadata.audio_codec.toUpperCase() : null
  const audioFacts = file.media_type === "video" && (audioCodec || file.channels || file.sample_rate)
    ? [audioCodec, file.channels ? `${file.channels === 1 ? "Mono" : file.channels === 2 ? "Stereo" : `${file.channels} channels`}` : null, file.sample_rate ? `${Math.round(file.sample_rate / 100) / 10} kHz` : null].filter(Boolean).join(" · ")
    : null
  const technical = [
    { label: "Dimensions", value: facts.dimensions === "Dimensions unavailable" ? null : facts.dimensions },
    { label: "Duration", value: facts.duration },
    { label: "Format", value: facts.format },
    { label: "Codec", value: file.video_codec ? String(file.video_codec).toUpperCase() : null },
    { label: "Frame rate", value: file.frame_rate ? `${Math.round(file.frame_rate * 100) / 100} fps` : null },
    { label: "Embedded audio", value: audioFacts },
    { label: "File size", value: formatVisualBytes(file.size_bytes) },
    { label: "MIME type", value: file.mime_type || null },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  const library = [
    { label: "Category", value: file.category ? String(file.category) : null },
    { label: "Tags", value: file.tags?.length ? file.tags.join(", ") : null },
    { label: "Added", value: formatVisualDate(file.created_at ?? undefined) },
    { label: "Updated", value: formatVisualDate(file.updated_at ?? undefined) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  const origin = [
    { label: "Source", value: fileSourceLine(file) },
    ...fileProvenanceDetails(file).map(({ label, value }) => ({ label, value })),
  ]
  return { origin, technical, library }
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
