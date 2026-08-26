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

export const visualFileAccept = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"

const visualMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
])
const visualExtensions = /\.(?:jpe?g|png|webp|mp4|mov|webm)$/i

export function acceptedVisualFiles(files: FileList | File[]) {
  return Array.from(files).filter((file) => visualMimeTypes.has(file.type) || visualExtensions.test(file.name))
}
