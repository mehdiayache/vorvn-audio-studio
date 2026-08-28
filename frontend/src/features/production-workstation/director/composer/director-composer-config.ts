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

export type DirectorOperationCapability = {
  operation: DirectorOperation
  output_media_type: "image" | "video"
  prompt: { supported: boolean; required: boolean; negative_prompt: boolean }
  inputs: DirectorInputSlot[]
  ratios: string[]
  resolutions: string[]
  durations: number[]
  fps: number[]
  supports_seed: boolean
  supports_cancel: boolean
}

export type DirectorModelCapability = {
  id: string
  label: string
  provider: string
  version: string
  description: string
  operations: DirectorOperationCapability[]
}

export type DirectorOperationInfo = { id: DirectorOperation; label: string; detail: string }
export type DirectorCapabilityCatalog = { operations: DirectorOperationInfo[]; models: DirectorModelCapability[] }

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
