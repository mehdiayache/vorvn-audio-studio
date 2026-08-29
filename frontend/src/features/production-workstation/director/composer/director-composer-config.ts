export type DirectorOperation = string
export type DirectorAttachmentKind = "image" | "video" | "audio"
export type DirectorAttachmentRole = string

export type DirectorInputSlot = {
  role: DirectorAttachmentRole
  label: string
  required: boolean
  media_types: DirectorAttachmentKind[]
  max: number
  mime_types: string[]
  max_bytes: number | null
  duration_min_ms: number | null
  duration_max_ms: number | null
  min_width: number | null
  min_height: number | null
  max_width: number | null
  max_height: number | null
  max_pixels: number | null
  fps_min: number | null
  fps_max: number | null
  aspect_ratio_min: number | null
  aspect_ratio_max: number | null
}

export type DirectorDurationRange = {
  min: number
  max: number
  step: number
  default: number
}

export type DirectorParameterCapability = {
  key: string
  type: "boolean" | "integer" | "number" | "select" | "text" | "textarea" | "asset_list" | "structured_shots"
  label: string
  exposure: "primary" | "advanced"
  required: boolean
  default: unknown
  options: unknown[]
  min: number | null
  max: number | null
  step: number | null
  max_length: number | null
  visible_when: Record<string, unknown>
  conflicts_with: string[]
  item: Record<string, unknown>
}

export type DirectorParameterValues = Record<string, unknown>

export type DirectorOperationCapability = {
  operation: DirectorOperation
  output_media_type: "image" | "video"
  prompt: { supported: boolean; required: boolean; negative_prompt: boolean; max_length: number }
  inputs: DirectorInputSlot[]
  input_order: string[]
  input_modes: DirectorInputMode[]
  required_any_of: string[][]
  ratios: string[]
  ratio_rules: { when: Record<string, unknown>; values: string[]; default: string }[]
  resolutions: string[]
  durations: number[]
  duration_range: DirectorDurationRange | null
  fps: number[]
  supports_seed: boolean
  supports_cancel: boolean
  parameters: DirectorParameterCapability[]
  output: { mime_type: string; extension: string }
}

export type DirectorInputMode = {
  id: string
  when_counts: Record<string, { min?: number; max?: number }>
  ratios: string[]
  default_ratio: string
  parameter_values: Record<string, unknown[]>
  elements?: {
    available?: boolean
    available_when?: Record<string, unknown>
    max_video_subjects?: number
    max_image_assets_total?: number
    max_image_assets_with_video_subjects?: number
    allow_video_subject_with_images?: boolean
  }
}

export type DirectorModelCapability = {
  id: string
  label: string
  provider: string
  provider_id: string
  provider_model_id: string
  adapter_key: string
  adapter_version: string
  capability_manifest_version: string
  status: "draft" | "verified" | "enabled"
  description: string
  operations: DirectorOperationCapability[]
}

export type DirectorOperationInfo = { id: DirectorOperation; label: string; detail: string }
export type DirectorCapabilityCatalog = {
  providers: { id: string; label: string }[]
  operations: DirectorOperationInfo[]
  models: DirectorModelCapability[]
}

export function normalizeCapabilityCatalog(catalog: DirectorCapabilityCatalog) {
  return {
    ...catalog,
    providers: catalog.providers || [],
    models: catalog.models.map((model) => ({
      ...model,
      provider_id: model.provider_id || model.provider.toLowerCase().replaceAll(" ", "-"),
      provider_model_id: model.provider_model_id || model.id,
      adapter_key: model.adapter_key || "legacy",
      adapter_version: model.adapter_version || "legacy",
      capability_manifest_version: model.capability_manifest_version || "legacy",
      status: model.status || "enabled",
      operations: model.operations.map((capability) => ({
        ...capability,
        prompt: { ...capability.prompt, max_length: capability.prompt.max_length || 20_000 },
        required_any_of: capability.required_any_of || [],
        input_order: capability.input_order || capability.inputs.map(({ role }) => role),
        input_modes: capability.input_modes || [],
        ratio_rules: capability.ratio_rules || [],
        duration_range: capability.duration_range || null,
        parameters: (capability.parameters || []).map((field) => ({
          ...field,
          exposure: field.exposure || (field.type === "asset_list" || field.type === "structured_shots" ? "primary" : "advanced"),
          conflicts_with: field.conflicts_with || [],
        })),
        output: capability.output || { mime_type: capability.output_media_type === "video" ? "video/mp4" : "image/png", extension: capability.output_media_type === "video" ? "mp4" : "png" },
      })),
    })),
  } satisfies DirectorCapabilityCatalog
}

export function operationLabel(operations: DirectorOperationInfo[], operation: DirectorOperation) {
  return operations.find(({ id }) => id === operation)?.label || operation
}

export function compatibleModels(models: DirectorModelCapability[], operation: DirectorOperation) {
  return models.filter((model) => model.operations.some((capability) => capability.operation === operation))
}

export function directReferenceMediaTypes(capability: DirectorOperationCapability) {
  return [...new Set(capability.inputs.flatMap(({ media_types }) => media_types))]
}

export function operationCapability(model: DirectorModelCapability, operation: DirectorOperation) {
  return model.operations.find((capability) => capability.operation === operation)
}

export function ratioChoices(
  capability: DirectorOperationCapability,
  parameters: DirectorParameterValues,
  counts: Record<string, number> = {},
) {
  const mode = inputMode(capability, counts)
  if (mode) return { values: mode.ratios, default: mode.default_ratio }
  const rule = capability.ratio_rules.find(({ when }) => (
    Object.entries(when).every(([key, expected]) => parameters[key] === expected)
  ))
  const values = rule?.values || capability.ratios
  return { values, default: rule?.default || values[0] || "" }
}

export function inputMode(
  capability: DirectorOperationCapability,
  counts: Record<string, number>,
) {
  return capability.input_modes.find(({ when_counts: conditions }) => Object.entries(conditions).every(([role, limit]) => {
    const count = counts[role] || 0
    return count >= (limit.min || 0) && (limit.max === undefined || count <= limit.max)
  }))
}

export function availableReferenceMediaTypes(
  capability: DirectorOperationCapability,
  values: DirectorParameterValues,
  counts: Record<string, number> = {},
) {
  const direct = capability.inputs
    .filter(({ role, max }) => (counts[role] || 0) < max)
    .flatMap(({ media_types }) => media_types)
  const nested = capability.parameters.flatMap((field) => {
    if (field.type !== "asset_list") return []
    if (!Object.entries(field.visible_when).every(([key, expected]) => values[key] === expected)) return []
    const items = Array.isArray(values[field.key])
      ? values[field.key] as { variant?: string; asset_ids?: number[]; audio_asset_ids?: number[] }[]
      : []
    const variants = Array.isArray(field.item.variants)
      ? field.item.variants as { id?: string; media_types?: DirectorAttachmentKind[]; max_assets?: number }[]
      : []
    const audio = field.item.audio as { media_types?: DirectorAttachmentKind[]; max_assets?: number } | undefined
    const acceptsAudio = audio && items.some(({ audio_asset_ids }) => (audio_asset_ids?.length || 0) < Number(audio.max_assets || 1))
    const activeVariants = variants.filter((variant) => items.some((item) => item.variant === variant.id && (item.asset_ids?.length || 0) < Number(variant.max_assets || 1)))
    return [
      ...activeVariants.flatMap(({ media_types }) => media_types || []),
      ...(acceptsAudio ? audio.media_types || [] : []),
    ]
  })
  return [...new Set([...direct, ...nested])]
}

export function attachmentRoleLabel(capability: DirectorOperationCapability, role: DirectorAttachmentRole) {
  return capability.inputs.find((slot) => slot.role === role)?.label || role.replaceAll("-", " ")
}

export function withParameterValue(field: DirectorParameterCapability, values: DirectorParameterValues, value: unknown) {
  const next = { ...values, [field.key]: value }
  if (field.type === "boolean" && value) field.conflicts_with.forEach((key) => { next[key] = false })
  return next
}
