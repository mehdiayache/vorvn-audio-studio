export type DirectorOperation = string
export type DirectorAttachmentKind = "image" | "video" | "audio"
export type DirectorAttachmentRole = string

export type DirectorInputSlot = {
  role: DirectorAttachmentRole
  label: string
  required: boolean
  media_types: DirectorAttachmentKind[]
  max: number
}

export type DirectorDurationRange = {
  min: number
  max: number
  step: number
  default: number
}

export type DirectorParameterCapability = {
  key: string
  type: "boolean" | "integer" | "number" | "select" | "text" | "textarea" | "asset_slot" | "asset_list" | "structured_shots"
  label: string
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
  required_any_of: string[][]
  ratios: string[]
  resolutions: string[]
  durations: number[]
  duration_range: DirectorDurationRange | null
  fps: number[]
  supports_seed: boolean
  supports_cancel: boolean
  parameters: DirectorParameterCapability[]
  output: { mime_type: string; extension: string }
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
        duration_range: capability.duration_range || null,
        parameters: (capability.parameters || []).map((field) => ({ ...field, conflicts_with: field.conflicts_with || [] })),
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

export function operationCapability(model: DirectorModelCapability, operation: DirectorOperation) {
  return model.operations.find((capability) => capability.operation === operation)
}

export function acceptedMediaTypes(capability: DirectorOperationCapability) {
  return [...new Set(capability.inputs.flatMap(({ media_types }) => media_types))]
}

export function attachmentRoleLabel(capability: DirectorOperationCapability, role: DirectorAttachmentRole) {
  return capability.inputs.find((slot) => slot.role === role)?.label || role.replaceAll("-", " ")
}
