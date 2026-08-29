import type { VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { DirectorComposerAttachment } from "./director-composer-attachments"
import { inputMode, ratioChoices, type DirectorAttachmentKind, type DirectorOperationCapability, type DirectorParameterValues } from "./director-composer-config"
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
  if (!capability.input_order.length) return retained
  const rank = new Map(capability.input_order.map((role, index) => [role, index]))
  return retained.map((attachment, index) => ({ attachment, index })).sort(
    (left, right) => (rank.get(left.attachment.role) ?? rank.size)
      - (rank.get(right.attachment.role) ?? rank.size) || left.index - right.index,
  ).map(({ attachment }) => attachment)
}

export function inputConstraintIssue(
  capability: DirectorOperationCapability,
  attachments: DirectorComposerAttachment[],
  assets: VentureAsset[],
) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  for (const attachment of attachments) {
    if (!attachment.assetId) continue
    const slot = capability.inputs.find(({ role }) => role === attachment.role)
    const asset = byId.get(attachment.assetId)
    if (!slot || !asset) continue
    if (slot.mime_types?.length && (!asset.mime_type || !slot.mime_types.includes(asset.mime_type))) return `${slot.label} must use a supported file format.`
    if (slot.max_bytes && Number(asset.size_bytes || 0) > slot.max_bytes) return `${slot.label} is larger than this model accepts.`
    if (slot.duration_min_ms !== null && slot.duration_min_ms !== undefined && Number(asset.duration_ms || 0) < slot.duration_min_ms) return `${slot.label} is shorter than this model accepts.`
    if (slot.duration_max_ms !== null && slot.duration_max_ms !== undefined && Number(asset.duration_ms || 0) > slot.duration_max_ms) return `${slot.label} is longer than this model accepts.`
    if (slot.min_width !== null && slot.min_width !== undefined && Number(asset.width || 0) < slot.min_width) return `${slot.label} is too narrow for this model.`
    if (slot.min_height !== null && slot.min_height !== undefined && Number(asset.height || 0) < slot.min_height) return `${slot.label} is too short for this model.`
    if (slot.max_width !== null && slot.max_width !== undefined && Number(asset.width || 0) > slot.max_width) return `${slot.label} is too wide for this model.`
    if (slot.max_height !== null && slot.max_height !== undefined && Number(asset.height || 0) > slot.max_height) return `${slot.label} is too tall for this model.`
    if (slot.max_pixels !== null && slot.max_pixels !== undefined && Number(asset.width || 0) * Number(asset.height || 0) > slot.max_pixels) return `${slot.label} resolution is too large for this model.`
    if (slot.fps_min !== null && slot.fps_min !== undefined && Number(asset.frame_rate || 0) < slot.fps_min) return `${slot.label} frame rate is too low for this model.`
    if (slot.fps_max !== null && slot.fps_max !== undefined && Number(asset.frame_rate || 0) > slot.fps_max) return `${slot.label} frame rate is too high for this model.`
    if (asset.width && asset.height) {
      const ratio = asset.width / asset.height
      if (slot.aspect_ratio_min !== null && slot.aspect_ratio_min !== undefined && ratio < slot.aspect_ratio_min) return `${slot.label} aspect ratio is too narrow.`
      if (slot.aspect_ratio_max !== null && slot.aspect_ratio_max !== undefined && ratio > slot.aspect_ratio_max) return `${slot.label} aspect ratio is too wide.`
    }
  }
  return undefined
}

export function capabilityDefaults(capability: DirectorOperationCapability) {
  const parameters = Object.fromEntries(capability.parameters.map((field) => [field.key, field.default]))
  const ratios = ratioChoices(capability, parameters)
  return {
    ratio: ratios.default || "1:1",
    resolution: capability.resolutions[0] || "",
    duration: capability.durations[0] || capability.duration_range?.default || 0,
    advanced: { seed: "", fps: capability.fps[0] || 0, negativePrompt: "", parameters } satisfies DirectorAdvancedValues,
  }
}

export function activeProviderParameters(capability: DirectorOperationCapability, values: DirectorParameterValues) {
  return Object.fromEntries(capability.parameters.flatMap((field) => {
    const isVisible = Object.entries(field.visible_when).every(([key, expected]) => values[key] === expected)
    return isVisible ? [[field.key, values[field.key] ?? field.default]] : []
  }))
}

type AssetListGroup = {
  name: string
  description?: string
  variant: string
  asset_ids: number[]
  audio_asset_ids: number[]
  start_time_ms?: number
  end_time_ms?: number
}

type AssetListVariant = {
  id: string
  label?: string
  media_types?: DirectorAttachmentKind[]
  max_assets?: number
  trim?: { start_default?: number; end_default?: number }
}

function subjectName(groups: AssetListGroup[]) {
  const names = new Set(groups.map(({ name }) => name.toLowerCase()))
  let index = groups.length + 1
  while (names.has(`subject${index}`)) index += 1
  return `subject${index}`
}

/** Add a canonical Asset to the first compatible provider-owned asset list.
 * Top-level input slots remain separate; this handles models such as Kling
 * Omni whose subject references live inside `elements`.
 */
export function addNestedReference(capability: DirectorOperationCapability, values: DirectorParameterValues, asset: VentureAsset) {
  const kind = assetKind(asset)
  if (!kind) return null
  for (const field of capability.parameters) {
    if (field.type !== "asset_list") continue
    const groups = structuredClone(Array.isArray(values[field.key]) ? values[field.key] : []) as AssetListGroup[]
    const variants = Array.isArray(field.item.variants) ? field.item.variants as AssetListVariant[] : []
    const variant = variants.find(({ media_types }) => media_types?.includes(kind))
    if (variant) {
      const maximum = Number(variant.max_assets || 1)
      const existing = kind === "image"
        ? groups.find((group) => group.variant === variant.id && group.asset_ids.length < maximum)
        : undefined
      if (existing) existing.asset_ids.push(asset.id)
      else groups.push({
        name: subjectName(groups), description: visualAssetName(asset), variant: variant.id,
        asset_ids: [asset.id], audio_asset_ids: [],
        ...(variant.trim ? {
          start_time_ms: Number(variant.trim.start_default || 0),
          end_time_ms: Math.min(Number(asset.duration_ms || Number.POSITIVE_INFINITY), Number(variant.trim.end_default || 8000)),
        } : {}),
      })
      return { ...values, [field.key]: groups }
    }
    const audio = field.item.audio as { media_types?: DirectorAttachmentKind[]; max_assets?: number } | undefined
    if (audio?.media_types?.includes(kind)) {
      const group = groups.find(({ audio_asset_ids }) => audio_asset_ids.length < Number(audio.max_assets || 1))
      if (!group) return null
      group.audio_asset_ids.push(asset.id)
      return { ...values, [field.key]: groups }
    }
  }
  return null
}

export function nestedReferenceAttachments(capability: DirectorOperationCapability, values: DirectorParameterValues, assets: VentureAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  return capability.parameters.flatMap((field): DirectorComposerAttachment[] => {
    if (field.type !== "asset_list") return []
    const groups = Array.isArray(values[field.key]) ? values[field.key] as AssetListGroup[] : []
    const variants = Array.isArray(field.item.variants) ? field.item.variants as AssetListVariant[] : []
    return groups.flatMap((group, groupIndex) => {
      const variant = variants.find(({ id }) => id === group.variant)
      const subject = group.name ? `@${group.name}` : `Subject ${groupIndex + 1}`
      const toAttachment = (assetId: number, listKey: "asset_ids" | "audio_asset_ids", position: number): DirectorComposerAttachment | null => {
        const asset = byId.get(assetId)
        const kind = asset && assetKind(asset)
        if (!asset || !kind) return null
        return {
          id: `nested-${field.key}-${groupIndex}-${listKey}-${assetId}-${position}`,
          assetId,
          name: visualAssetName(asset),
          kind,
          role: "",
          roleLabel: listKey === "audio_asset_ids" ? `${subject} · Reference audio` : `${subject} · ${variant?.label || "Reference"}`,
          previewUrl: assetPreview(asset),
          posterUrl: asset.media_type !== "audio" ? visualAssetPosterUrl(asset) : null,
          status: "ready",
          nested: { fieldKey: field.key, groupIndex, listKey, assetId },
        }
      }
      return [
        ...(group.asset_ids || []).map((assetId, position) => toAttachment(assetId, "asset_ids", position)),
        ...(group.audio_asset_ids || []).map((assetId, position) => toAttachment(assetId, "audio_asset_ids", position)),
      ].filter((item): item is DirectorComposerAttachment => Boolean(item))
    })
  })
}

export function removeNestedReference(values: DirectorParameterValues, attachment: DirectorComposerAttachment) {
  const nested = attachment.nested
  if (!nested) return values
  const groups = structuredClone(Array.isArray(values[nested.fieldKey]) ? values[nested.fieldKey] : []) as AssetListGroup[]
  const group = groups[nested.groupIndex]
  if (!group) return values
  group[nested.listKey] = group[nested.listKey].filter((assetId) => assetId !== nested.assetId)
  if (!group.asset_ids.length && !group.audio_asset_ids.length) groups.splice(nested.groupIndex, 1)
  return { ...values, [nested.fieldKey]: groups }
}

export function parameterIssue(capability: DirectorOperationCapability, values: DirectorParameterValues, duration: number, assets: VentureAsset[] = []) {
  const active = activeProviderParameters(capability, values)
  for (const field of capability.parameters) {
    if (!(field.key in active)) continue
    const value = active[field.key]
    if (field.required && (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length))) {
      return field.type === "structured_shots" ? "Add at least one directed shot." : `Choose ${field.label.toLowerCase()}.`
    }
    const conflict = field.conflicts_with.find((key) => Boolean(value) && Boolean(active[key]))
    if (conflict) return `${field.label} cannot be used with ${capability.parameters.find(({ key }) => key === conflict)?.label || conflict}.`
    if (field.type === "structured_shots" && Array.isArray(value)) {
      const maximum = Number(field.item.max_items || 0)
      if (maximum && value.length > maximum) return `${field.label} accepts at most ${maximum} shots.`
      if (value.some((shot) => typeof shot !== "object" || shot === null || !("prompt" in shot) || !String(shot.prompt).trim())) return "Write a direction for every shot."
      const total = value.reduce((sum, shot) => sum + Number(typeof shot === "object" && shot !== null && "duration" in shot ? shot.duration : 0), 0)
      if (total !== duration) return `Shot durations must add up to ${duration} seconds.`
    }
    if (field.type === "asset_list" && Array.isArray(value)) {
      const maximum = Number(field.max || 0)
      if (maximum && value.length > maximum) return `${field.label} accepts at most ${maximum} items.`
      const names = new Set<string>()
      const variants = Array.isArray(field.item.variants) ? field.item.variants as { id: string; label: string; media_types?: string[]; min_assets: number; max_assets: number; trim?: { duration_min: number; duration_max: number } }[] : []
      const variantCounts = Object.fromEntries(variants.map(({ id }) => [id, 0])) as Record<string, number>
      const usedAssets = new Set<number>()
      for (const raw of value) {
        if (typeof raw !== "object" || raw === null) return `Check ${field.label.toLowerCase()}.`
        const item = raw as { name?: string; description?: string; variant?: string; asset_ids?: number[]; audio_asset_ids?: number[]; start_time_ms?: number; end_time_ms?: number }
        const name = String(item.name || "").trim()
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return "Give every subject a prompt name using letters, numbers, _ or -."
        if (field.item.description_required && !String(item.description || "").trim()) return "Describe every subject reference."
        if (names.has(name.toLowerCase())) return "Subject prompt names must be unique."
        names.add(name.toLowerCase())
        const variant = variants.find(({ id }) => id === item.variant)
        if (!variant) return "Choose a subject reference type."
        variantCounts[variant.id] = (variantCounts[variant.id] || 0) + 1
        const count = item.asset_ids?.length || 0
        const referenceKind = variant.media_types?.[0] || "reference"
        if (count < variant.min_assets) {
          const missing = variant.min_assets - count
          return `Add ${missing} more ${referenceKind}${missing === 1 ? "" : "s"} to @${name}.`
        }
        if (count > variant.max_assets) return `@${name} accepts at most ${variant.max_assets} ${referenceKind}${variant.max_assets === 1 ? "" : "s"}.`
        for (const assetId of [...(item.asset_ids || []), ...(item.audio_asset_ids || [])]) {
          if (usedAssets.has(assetId)) return "Use each subject Asset only once."
          usedAssets.add(assetId)
        }
        if (variant.trim) {
          const trimDuration = Number(item.end_time_ms || 0) - Number(item.start_time_ms || 0)
          if (trimDuration < variant.trim.duration_min || trimDuration > variant.trim.duration_max) return `${variant.label} trim must be between ${variant.trim.duration_min / 1000} and ${variant.trim.duration_max / 1000} seconds.`
          const source = assets.find(({ id }) => id === item.asset_ids?.[0])
          if (source?.duration_ms && Number(item.end_time_ms || 0) > source.duration_ms) return `${variant.label} trim extends past the source video.`
        }
        const audioContract = field.item.audio as { duration_min_ms?: number; duration_max_ms?: number } | undefined
        const audioAsset = assets.find(({ id }) => id === item.audio_asset_ids?.[0])
        if (audioAsset?.duration_ms && audioContract && (audioAsset.duration_ms < Number(audioContract.duration_min_ms || 0) || audioAsset.duration_ms > Number(audioContract.duration_max_ms || Number.POSITIVE_INFINITY))) return "Subject audio must be between 5 and 30 seconds."
      }
      const limits = Array.isArray(field.item.combination_limits) ? field.item.combination_limits as { when: Record<string, boolean>; max: Record<string, number> }[] : []
      for (const limit of limits) {
        if (!Object.entries(limit.when).every(([key, expected]) => Boolean(variantCounts[key]) === expected)) continue
        if (Object.entries(limit.max).some(([key, allowed]) => (variantCounts[key] || 0) > allowed)) return "This combination has too many subject references for the model."
      }
    }
  }
  return undefined
}

export function inputModeIssue(
  capability: DirectorOperationCapability,
  attachments: DirectorComposerAttachment[],
  values: DirectorParameterValues,
) {
  if (!capability.input_modes.length) return undefined
  const counts = Object.fromEntries(capability.inputs.map(({ role }) => [
    role, attachments.filter((attachment) => attachment.assetId && attachment.role === role).length,
  ]))
  const mode = inputMode(capability, counts)
  if (!mode) return "This combination of references is not supported by this model."
  for (const [key, allowed] of Object.entries(mode.parameter_values || {})) {
    if (!allowed.includes(values[key])) {
      const label = capability.parameters.find((field) => field.key === key)?.label || key
      return `${label} is not available with these references.`
    }
  }
  const elements = Array.isArray(values.elements) ? values.elements as { variant?: string; asset_ids?: number[] }[] : []
  const policy = mode.elements || {}
  let available = policy.available ?? true
  if (policy.available_when && !Object.entries(policy.available_when).every(([key, expected]) => values[key] === expected)) available = false
  if (elements.length && !available) return "Character references require directed multi-shot mode with this video input."
  const directImages = counts["reference-image"] || 0
  const nestedImages = elements.filter(({ variant }) => variant === "images").reduce((sum, item) => sum + (item.asset_ids?.length || 0), 0)
  const videoSubjects = elements.filter(({ variant }) => variant === "video").length
  if (policy.max_video_subjects && videoSubjects > policy.max_video_subjects) return "This reference mode has too many video subjects."
  if (policy.max_image_assets_total && directImages + nestedImages > policy.max_image_assets_total) return "This reference mode has too many image references."
  if (videoSubjects && policy.max_image_assets_with_video_subjects !== undefined && directImages + nestedImages > policy.max_image_assets_with_video_subjects) return "This mix of image and video subjects has too many images."
  if (videoSubjects && policy.allow_video_subject_with_images === false && directImages + nestedImages) return "Video subjects cannot be mixed with image references in this mode."
  return undefined
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
