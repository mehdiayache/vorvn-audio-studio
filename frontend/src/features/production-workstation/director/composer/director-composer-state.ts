import type { VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { DirectorComposerAttachment } from "./director-composer-attachments"
import type { DirectorAttachmentKind, DirectorOperationCapability } from "./director-composer-config"
import type { DirectorGeneration } from "./director-generation-types"

export function identifier(prefix: string) {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function fileKind(file: File): DirectorAttachmentKind | null {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return null
}

export function assetKind(asset: VentureAsset): DirectorAttachmentKind | null {
  return asset.media_type === "image" || asset.media_type === "video" || asset.media_type === "audio" ? asset.media_type : null
}

export function assetPreview(asset: VentureAsset) {
  if (asset.media_type === "audio") return asset.filename ? `/audio/${encodeURIComponent(asset.filename)}` : null
  return visualAssetUrl(asset)
}

export function assignInputs(attachments: DirectorComposerAttachment[], capability: DirectorOperationCapability) {
  const counts = new Map<string, number>()
  const retained: DirectorComposerAttachment[] = []
  for (const attachment of attachments) {
    const matching = capability.inputs.filter((slot) => slot.media_types.includes(attachment.kind))
    const current = matching.find((slot) => slot.role === attachment.role && (counts.get(slot.role) || 0) < slot.max)
    const required = matching.find((slot) => slot.required && (counts.get(slot.role) || 0) < slot.max)
    const slot = current || required || matching.find((candidate) => (counts.get(candidate.role) || 0) < candidate.max)
    if (!slot) continue
    counts.set(slot.role, (counts.get(slot.role) || 0) + 1)
    retained.push({ ...attachment, role: slot.role })
  }
  return retained
}

export function capabilityDefaults(capability: DirectorOperationCapability) {
  return {
    ratio: capability.ratios[0] || "1:1",
    resolution: capability.resolutions[0] || "",
    duration: capability.durations[0] || 0,
    advanced: { seed: "", fps: capability.fps[0] || 0, negativePrompt: "" } satisfies DirectorAdvancedValues,
  }
}

export function generationAttachments(generation: DirectorGeneration, assets: VentureAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  return generation.recipe.inputs.map((input): DirectorComposerAttachment => {
    const asset = byId.get(input.asset_id)
    return {
      id: `asset-${input.asset_id}-${input.position}`, assetId: input.asset_id,
      name: asset ? visualAssetName(asset) : `Asset ${input.asset_id}`,
      kind: input.media_type, role: input.role,
      previewUrl: asset ? assetPreview(asset) : null,
      posterUrl: asset && asset.media_type !== "audio" ? visualAssetPosterUrl(asset) : null,
      status: "ready",
    }
  })
}
