import type { VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { DirectorComposerAttachment } from "./director-composer-attachments"
import type { DirectorAttachmentKind, DirectorOperationCapability, DirectorParameterValues } from "./director-composer-config"
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
  const parameters = Object.fromEntries(capability.parameters.map((field) => [field.key, field.default]))
  return {
    ratio: capability.ratios[0] || "1:1",
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
    if (field.required && (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length))) return `Choose ${field.label.toLowerCase()}.`
    const conflict = field.conflicts_with.find((key) => Boolean(value) && Boolean(active[key]))
    if (conflict) return `${field.label} cannot be used with ${capability.parameters.find(({ key }) => key === conflict)?.label || conflict}.`
    if (field.type === "structured_shots" && Array.isArray(value)) {
      if (values.customize_multi_shots && !value.length) return "Add at least one directed shot."
      const maximum = Number(field.item.max_items || 0)
      if (maximum && value.length > maximum) return `${field.label} accepts at most ${maximum} shots.`
      if (value.some((shot) => typeof shot !== "object" || shot === null || !("prompt" in shot) || !String(shot.prompt).trim())) return "Write a direction for every shot."
      const total = value.reduce((sum, shot) => sum + Number(typeof shot === "object" && shot !== null && "duration" in shot ? shot.duration : 0), 0)
      if (values.customize_multi_shots && total !== duration) return `Shot durations must add up to ${duration} seconds.`
    }
    if (field.type === "asset_list" && Array.isArray(value)) {
      const maximum = Number(field.max || 0)
      if (maximum && value.length > maximum) return `${field.label} accepts at most ${maximum} items.`
      const names = new Set<string>()
      const variants = Array.isArray(field.item.variants) ? field.item.variants as { id: string; label: string; min_assets: number; max_assets: number; trim?: { duration_min: number; duration_max: number } }[] : []
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
        if (count < variant.min_assets || count > variant.max_assets) return `${variant.label} needs between ${variant.min_assets} and ${variant.max_assets} Assets.`
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
