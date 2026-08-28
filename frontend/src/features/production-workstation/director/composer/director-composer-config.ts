export type DirectorOperation = "image" | "image-to-video" | "frames-to-video" | "reference-video" | "talking-video"
export type DirectorAttachmentKind = "image" | "video" | "audio"
export type DirectorAttachmentRole = "reference" | "source-image" | "start-frame" | "end-frame" | "character" | "voice"

export type DirectorModelCapability = {
  id: string
  label: string
  provider: string
  version: string
  description: string
  operations: DirectorOperation[]
  maxImages: number
  maxAudio: number
  roles: DirectorAttachmentRole[]
  ratios: string[]
  resolutions: string[]
  durations: number[]
  fps: number[]
  supportsSeed: boolean
  supportsNegativePrompt: boolean
  supportsCancel: boolean
}

export const DIRECTOR_OPERATIONS: { id: DirectorOperation; label: string; detail: string }[] = [
  { id: "image", label: "Image", detail: "Create a still visual" },
  { id: "image-to-video", label: "Image to video", detail: "Animate one source image" },
  { id: "frames-to-video", label: "Frames to video", detail: "Move between a start and end frame" },
  { id: "reference-video", label: "Reference video", detail: "Guide motion with visual references" },
  { id: "talking-video", label: "Talking video", detail: "Animate a character from audio" },
]

export const DIRECTOR_MODELS: DirectorModelCapability[] = [
  {
    id: "model-a",
    label: "Model A",
    provider: "Prototype Lab",
    version: "a-1",
    description: "Still images and single-image motion",
    operations: ["image", "image-to-video"],
    maxImages: 1,
    maxAudio: 0,
    roles: ["reference", "source-image"],
    ratios: ["1:1", "16:9", "9:16", "4:5"],
    resolutions: ["1K", "2K"],
    durations: [5, 8],
    fps: [24],
    supportsSeed: true,
    supportsNegativePrompt: true,
    supportsCancel: true,
  },
  {
    id: "model-b",
    label: "Model B",
    provider: "Prototype Lab",
    version: "b-1",
    description: "Start and end frame motion",
    operations: ["frames-to-video"],
    maxImages: 2,
    maxAudio: 0,
    roles: ["start-frame", "end-frame"],
    ratios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    durations: [5, 8, 10],
    fps: [24, 30],
    supportsSeed: true,
    supportsNegativePrompt: true,
    supportsCancel: true,
  },
  {
    id: "model-c",
    label: "Model C",
    provider: "Prototype Lab",
    version: "c-1",
    description: "Up to three references with optional audio",
    operations: ["reference-video", "talking-video"],
    maxImages: 3,
    maxAudio: 1,
    roles: ["reference", "character", "voice"],
    ratios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    durations: [5, 10, 15],
    fps: [24, 30],
    supportsSeed: true,
    supportsNegativePrompt: true,
    supportsCancel: true,
  },
]

export function operationLabel(operation: DirectorOperation) {
  return DIRECTOR_OPERATIONS.find(({ id }) => id === operation)?.label || operation
}

export function compatibleModels(operation: DirectorOperation) {
  return DIRECTOR_MODELS.filter(({ operations }) => operations.includes(operation))
}

export function acceptedKinds(operation: DirectorOperation): DirectorAttachmentKind[] {
  if (operation === "talking-video") return ["image", "audio"]
  return ["image"]
}

export function requiredRoles(operation: DirectorOperation): DirectorAttachmentRole[] {
  if (operation === "image-to-video") return ["source-image"]
  if (operation === "frames-to-video") return ["start-frame", "end-frame"]
  if (operation === "reference-video") return ["reference"]
  if (operation === "talking-video") return ["character", "voice"]
  return []
}

export function roleForAttachment(operation: DirectorOperation, kind: DirectorAttachmentKind, index: number): DirectorAttachmentRole {
  if (kind === "audio") return "voice"
  if (operation === "image-to-video") return "source-image"
  if (operation === "frames-to-video") return index === 0 ? "start-frame" : "end-frame"
  if (operation === "talking-video") return index === 0 ? "character" : "reference"
  return "reference"
}

export function attachmentRoleLabel(role: DirectorAttachmentRole) {
  return ({
    reference: "Reference",
    "source-image": "Source image",
    "start-frame": "Start frame",
    "end-frame": "End frame",
    character: "Character",
    voice: "Voice audio",
  } as const)[role]
}
