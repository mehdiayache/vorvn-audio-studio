import type { VentureAsset } from "@/types/domain"

export function isVisualAsset(asset: VentureAsset) {
  return asset.media_type === "image" || asset.media_type === "video"
}

export function visualAssetName(asset: VentureAsset) {
  return String(asset.name || asset.title || asset.filename || "Untitled visual")
}

export function visualAssetUrl(asset: VentureAsset) {
  return asset.filename ? `/media/${encodeURIComponent(asset.filename)}` : ""
}

export function visualAssetPosterUrl(asset: VentureAsset) {
  if (asset.media_type !== "video" || !asset.filename) return visualAssetUrl(asset)
  return `/api/v1/media/video-poster/${encodeURIComponent(asset.filename)}`
}

export function visualAssetPlaybackUrl(asset: VentureAsset) {
  if (asset.media_type !== "video" || !asset.filename) return visualAssetUrl(asset)
  const format = String(asset.media_format || "").toLowerCase()
  const codec = String(asset.video_codec || "").toLowerCase()
  return format === "mp4" && codec === "h264"
    ? visualAssetUrl(asset)
    : `/api/v1/media/video-proxy/${encodeURIComponent(asset.filename)}`
}

export function visualAssetFacts(asset: VentureAsset) {
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : "Dimensions unavailable"
  const duration = asset.media_type === "video" && asset.duration_ms
    ? `${Math.round(asset.duration_ms / 100) / 10}s`
    : null
  return {
    dimensions,
    duration,
    format: String(asset.media_format || asset.mime_type?.split("/")[1] || asset.media_type || "media").toUpperCase(),
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

export function visualAssetDetails(asset: VentureAsset) {
  const facts = visualAssetFacts(asset)
  const technical = [
    { label: "Dimensions", value: facts.dimensions === "Dimensions unavailable" ? null : facts.dimensions },
    { label: "Duration", value: facts.duration },
    { label: "Format", value: facts.format },
    { label: "Codec", value: asset.video_codec ? String(asset.video_codec).toUpperCase() : null },
    { label: "Frame rate", value: asset.frame_rate ? `${Math.round(asset.frame_rate * 100) / 100} fps` : null },
    { label: "File size", value: formatVisualBytes(asset.size_bytes) },
    { label: "MIME type", value: asset.mime_type || null },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  const library = [
    { label: "Available in", value: asset.scope === "studio" ? "Studio Library" : asset.scope === "venture" ? "Venture Library" : null },
    { label: "Category", value: asset.category ? String(asset.category) : null },
    { label: "Tags", value: asset.tags?.length ? asset.tags.join(", ") : null },
    { label: "Added", value: formatVisualDate(asset.created_at) },
    { label: "Updated", value: formatVisualDate(asset.updated_at) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  return { technical, library }
}

export const visualFileAccept = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"

const visualMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
])
const visualExtensions = /\.(?:jpe?g|png|webp|mp4|mov|webm)$/i

export function acceptedVisualFiles(files: FileList | File[]) {
  return Array.from(files).filter((file) => visualMimeTypes.has(file.type) || visualExtensions.test(file.name))
}
