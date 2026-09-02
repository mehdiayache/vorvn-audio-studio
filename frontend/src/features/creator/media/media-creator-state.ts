import type { WorkspaceFile } from "@/types/domain"
import { visualFileName, visualFilePosterUrl, visualFileUrl } from "@/features/projects/audiovisual/library/visual-files"
import type { MediaAdvancedValues } from "./media-advanced-settings"
import type { MediaCreatorAttachment } from "./media-creator-attachments"
import { inputMode, ratioChoices, type MediaAttachmentKind, type MediaOperationCapability, type MediaParameterValues } from "./media-creator-config"
import type { MediaGeneration } from "./media-generation-types"

export function identifier(prefix: string) {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function fileKind(file: File): MediaAttachmentKind | null {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return null
}

export function fileAttachmentKind(file: WorkspaceFile): MediaAttachmentKind | null {
  return file.media_type === "image" || file.media_type === "video" || file.media_type === "audio" ? file.media_type : null
}

export function filePreviewUrl(file: WorkspaceFile) {
  if (file.media_type === "audio") return file.filename ? `/audio/${encodeURIComponent(file.filename)}` : null
  return visualFileUrl(file)
}

export function assignInputs(attachments: MediaCreatorAttachment[], capability: MediaOperationCapability) {
  const counts = new Map<string, number>()
  const retained: MediaCreatorAttachment[] = []
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
  capability: MediaOperationCapability,
  attachments: MediaCreatorAttachment[],
  files: WorkspaceFile[],
) {
  const byId = new Map(files.map((file) => [file.id, file]))
  for (const attachment of attachments) {
    if (!attachment.fileId) continue
    const slot = capability.inputs.find(({ role }) => role === attachment.role)
    const file = byId.get(attachment.fileId)
    if (!slot || !file) continue
    if (slot.mime_types?.length && (!file.mime_type || !slot.mime_types.includes(file.mime_type))) return `${slot.label} must use a supported file format.`
    if (slot.max_bytes && Number(file.size_bytes || 0) > slot.max_bytes) return `${slot.label} is larger than this model accepts.`
    if (slot.duration_min_ms !== null && slot.duration_min_ms !== undefined && Number(file.duration_ms || 0) < slot.duration_min_ms) return `${slot.label} is shorter than this model accepts.`
    if (slot.duration_max_ms !== null && slot.duration_max_ms !== undefined && Number(file.duration_ms || 0) > slot.duration_max_ms) return `${slot.label} is longer than this model accepts.`
    if (slot.min_width !== null && slot.min_width !== undefined && Number(file.width || 0) < slot.min_width) return `${slot.label} is too narrow for this model.`
    if (slot.min_height !== null && slot.min_height !== undefined && Number(file.height || 0) < slot.min_height) return `${slot.label} is too short for this model.`
    if (slot.max_width !== null && slot.max_width !== undefined && Number(file.width || 0) > slot.max_width) return `${slot.label} is too wide for this model.`
    if (slot.max_height !== null && slot.max_height !== undefined && Number(file.height || 0) > slot.max_height) return `${slot.label} is too tall for this model.`
    if (slot.max_pixels !== null && slot.max_pixels !== undefined && Number(file.width || 0) * Number(file.height || 0) > slot.max_pixels) return `${slot.label} resolution is too large for this model.`
    if (slot.fps_min !== null && slot.fps_min !== undefined && Number(file.frame_rate || 0) < slot.fps_min) return `${slot.label} frame rate is too low for this model.`
    if (slot.fps_max !== null && slot.fps_max !== undefined && Number(file.frame_rate || 0) > slot.fps_max) return `${slot.label} frame rate is too high for this model.`
    if (file.width && file.height) {
      const ratio = file.width / file.height
      if (slot.aspect_ratio_min !== null && slot.aspect_ratio_min !== undefined && ratio < slot.aspect_ratio_min) return `${slot.label} aspect ratio is too narrow.`
      if (slot.aspect_ratio_max !== null && slot.aspect_ratio_max !== undefined && ratio > slot.aspect_ratio_max) return `${slot.label} aspect ratio is too wide.`
    }
  }
  return undefined
}

export function capabilityDefaults(capability: MediaOperationCapability) {
  const parameters = Object.fromEntries(capability.parameters.map((field) => [field.key, field.default]))
  const ratios = ratioChoices(capability, parameters)
  return {
    ratio: ratios.default || "1:1",
    resolution: capability.resolutions[0] || "",
    duration: capability.durations[0] || capability.duration_range?.default || 0,
    advanced: { seed: "", fps: capability.fps[0] || 0, negativePrompt: "", parameters } satisfies MediaAdvancedValues,
  }
}

export function activeProviderParameters(capability: MediaOperationCapability, values: MediaParameterValues) {
  return Object.fromEntries(capability.parameters.flatMap((field) => {
    const isVisible = Object.entries(field.visible_when).every(([key, expected]) => values[key] === expected)
    return isVisible ? [[field.key, values[field.key] ?? field.default]] : []
  }))
}

type FileListGroup = {
  name: string
  description?: string
  variant: string
  file_ids: number[]
  audio_file_ids: number[]
  start_time_ms?: number
  end_time_ms?: number
}

type FileListVariant = {
  id: string
  label?: string
  media_types?: MediaAttachmentKind[]
  max_files?: number
  trim?: { start_default?: number; end_default?: number }
}

function subjectName(groups: FileListGroup[]) {
  const names = new Set(groups.map(({ name }) => name.toLowerCase()))
  let index = groups.length + 1
  while (names.has(`subject${index}`)) index += 1
  return `subject${index}`
}

/** Add canonical media to the first compatible provider-owned input list.
 * Top-level input slots remain separate; this handles models such as Kling
 * Omni whose subject references live inside `elements`.
 */
export function addNestedReference(capability: MediaOperationCapability, values: MediaParameterValues, file: WorkspaceFile) {
  const kind = fileAttachmentKind(file)
  if (!kind) return null
  for (const field of capability.parameters) {
    if (field.type !== "file_list") continue
    const groups = structuredClone(Array.isArray(values[field.key]) ? values[field.key] : []) as FileListGroup[]
    const variants = Array.isArray(field.item.variants) ? field.item.variants as FileListVariant[] : []
    const variant = variants.find(({ media_types }) => media_types?.includes(kind))
    if (variant) {
      const maximum = Number(variant.max_files || 1)
      const existing = kind === "image"
        ? groups.find((group) => group.variant === variant.id && group.file_ids.length < maximum)
        : undefined
      if (existing) existing.file_ids.push(file.id)
      else groups.push({
        name: subjectName(groups), description: visualFileName(file), variant: variant.id,
        file_ids: [file.id], audio_file_ids: [],
        ...(variant.trim ? {
          start_time_ms: Number(variant.trim.start_default || 0),
          end_time_ms: Math.min(Number(file.duration_ms || Number.POSITIVE_INFINITY), Number(variant.trim.end_default || 8000)),
        } : {}),
      })
      return { ...values, [field.key]: groups }
    }
    const audio = field.item.audio as { media_types?: MediaAttachmentKind[]; max_files?: number } | undefined
    if (audio?.media_types?.includes(kind)) {
      const group = groups.find(({ audio_file_ids }) => audio_file_ids.length < Number(audio.max_files || 1))
      if (!group) return null
      group.audio_file_ids.push(file.id)
      return { ...values, [field.key]: groups }
    }
  }
  return null
}

export function nestedReferenceAttachments(capability: MediaOperationCapability, values: MediaParameterValues, files: WorkspaceFile[]) {
  const byId = new Map(files.map((file) => [file.id, file]))
  return capability.parameters.flatMap((field): MediaCreatorAttachment[] => {
    if (field.type !== "file_list") return []
    const groups = Array.isArray(values[field.key]) ? values[field.key] as FileListGroup[] : []
    const variants = Array.isArray(field.item.variants) ? field.item.variants as FileListVariant[] : []
    return groups.flatMap((group, groupIndex) => {
      const variant = variants.find(({ id }) => id === group.variant)
      const subject = group.name ? `@${group.name}` : `Subject ${groupIndex + 1}`
      const toAttachment = (fileId: number, listKey: "file_ids" | "audio_file_ids", position: number): MediaCreatorAttachment | null => {
        const file = byId.get(fileId)
        const kind = file && fileAttachmentKind(file)
        if (!file || !kind) return null
        return {
          id: `nested-${field.key}-${groupIndex}-${listKey}-${fileId}-${position}`,
          fileId,
          name: visualFileName(file),
          kind,
          role: "",
          roleLabel: listKey === "audio_file_ids" ? `${subject} · Reference audio` : `${subject} · ${variant?.label || "Reference"}`,
          previewUrl: filePreviewUrl(file),
          posterUrl: file.media_type !== "audio" ? visualFilePosterUrl(file) : null,
          status: "ready",
          nested: { fieldKey: field.key, groupIndex, listKey, fileId },
        }
      }
      return [
        ...(group.file_ids || []).map((fileId, position) => toAttachment(fileId, "file_ids", position)),
        ...(group.audio_file_ids || []).map((fileId, position) => toAttachment(fileId, "audio_file_ids", position)),
      ].filter((item): item is MediaCreatorAttachment => Boolean(item))
    })
  })
}

export function removeNestedReference(values: MediaParameterValues, attachment: MediaCreatorAttachment) {
  const nested = attachment.nested
  if (!nested) return values
  const groups = structuredClone(Array.isArray(values[nested.fieldKey]) ? values[nested.fieldKey] : []) as FileListGroup[]
  const group = groups[nested.groupIndex]
  if (!group) return values
  group[nested.listKey] = group[nested.listKey].filter((fileId) => fileId !== nested.fileId)
  if (!group.file_ids.length && !group.audio_file_ids.length) groups.splice(nested.groupIndex, 1)
  return { ...values, [nested.fieldKey]: groups }
}

export function parameterIssue(capability: MediaOperationCapability, values: MediaParameterValues, duration: number, files: WorkspaceFile[] = []) {
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
    if (field.type === "file_list" && Array.isArray(value)) {
      const maximum = Number(field.max || 0)
      if (maximum && value.length > maximum) return `${field.label} accepts at most ${maximum} items.`
      const names = new Set<string>()
      const variants = Array.isArray(field.item.variants) ? field.item.variants as { id: string; label: string; media_types?: string[]; min_files: number; max_files: number; trim?: { duration_min: number; duration_max: number } }[] : []
      const variantCounts = Object.fromEntries(variants.map(({ id }) => [id, 0])) as Record<string, number>
      const usedFiles = new Set<number>()
      for (const raw of value) {
        if (typeof raw !== "object" || raw === null) return `Check ${field.label.toLowerCase()}.`
        const item = raw as { name?: string; description?: string; variant?: string; file_ids?: number[]; audio_file_ids?: number[]; start_time_ms?: number; end_time_ms?: number }
        const name = String(item.name || "").trim()
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return "Give every subject a prompt name using letters, numbers, _ or -."
        if (field.item.description_required && !String(item.description || "").trim()) return "Describe every subject reference."
        if (names.has(name.toLowerCase())) return "Subject prompt names must be unique."
        names.add(name.toLowerCase())
        const variant = variants.find(({ id }) => id === item.variant)
        if (!variant) return "Choose a subject reference type."
        variantCounts[variant.id] = (variantCounts[variant.id] || 0) + 1
        const count = item.file_ids?.length || 0
        const referenceKind = variant.media_types?.[0] || "reference"
        if (count < variant.min_files) {
          const missing = variant.min_files - count
          return `Add ${missing} more ${referenceKind}${missing === 1 ? "" : "s"} to @${name}.`
        }
        if (count > variant.max_files) return `@${name} accepts at most ${variant.max_files} ${referenceKind}${variant.max_files === 1 ? "" : "s"}.`
        for (const fileId of [...(item.file_ids || []), ...(item.audio_file_ids || [])]) {
          if (usedFiles.has(fileId)) return "Use each subject media item only once."
          usedFiles.add(fileId)
        }
        if (variant.trim) {
          const trimDuration = Number(item.end_time_ms || 0) - Number(item.start_time_ms || 0)
          if (trimDuration < variant.trim.duration_min || trimDuration > variant.trim.duration_max) return `${variant.label} trim must be between ${variant.trim.duration_min / 1000} and ${variant.trim.duration_max / 1000} seconds.`
          const source = files.find(({ id }) => id === item.file_ids?.[0])
          if (source?.duration_ms && Number(item.end_time_ms || 0) > source.duration_ms) return `${variant.label} trim extends past the source video.`
        }
        const audioContract = field.item.audio as { duration_min_ms?: number; duration_max_ms?: number } | undefined
        const audioFile = files.find(({ id }) => id === item.audio_file_ids?.[0])
        if (audioFile?.duration_ms && audioContract && (audioFile.duration_ms < Number(audioContract.duration_min_ms || 0) || audioFile.duration_ms > Number(audioContract.duration_max_ms || Number.POSITIVE_INFINITY))) return "Subject audio must be between 5 and 30 seconds."
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
  capability: MediaOperationCapability,
  attachments: MediaCreatorAttachment[],
  values: MediaParameterValues,
) {
  if (!capability.input_modes.length) return undefined
  const counts = Object.fromEntries(capability.inputs.map(({ role }) => [
    role, attachments.filter((attachment) => attachment.fileId && attachment.role === role).length,
  ]))
  const mode = inputMode(capability, counts)
  if (!mode) return "This combination of references is not supported by this model."
  for (const [key, allowed] of Object.entries(mode.parameter_values || {})) {
    if (!allowed.includes(values[key])) {
      const label = capability.parameters.find((field) => field.key === key)?.label || key
      return `${label} is not available with these references.`
    }
  }
  const elements = Array.isArray(values.elements) ? values.elements as { variant?: string; file_ids?: number[] }[] : []
  const policy = mode.elements || {}
  let available = policy.available ?? true
  if (policy.available_when && !Object.entries(policy.available_when).every(([key, expected]) => values[key] === expected)) available = false
  if (elements.length && !available) return "Character references require directed multi-shot mode with this video input."
  const directImages = counts["reference-image"] || 0
  const nestedImages = elements.filter(({ variant }) => variant === "images").reduce((sum, item) => sum + (item.file_ids?.length || 0), 0)
  const videoSubjects = elements.filter(({ variant }) => variant === "video").length
  if (policy.max_video_subjects && videoSubjects > policy.max_video_subjects) return "This reference mode has too many video subjects."
  if (policy.max_image_files_total && directImages + nestedImages > policy.max_image_files_total) return "This reference mode has too many image references."
  if (videoSubjects && policy.max_image_files_with_video_subjects !== undefined && directImages + nestedImages > policy.max_image_files_with_video_subjects) return "This mix of image and video subjects has too many images."
  if (videoSubjects && policy.allow_video_subject_with_images === false && directImages + nestedImages) return "Video subjects cannot be mixed with image references in this mode."
  return undefined
}

export function generationAttachments(generation: MediaGeneration, files: WorkspaceFile[]) {
  const byId = new Map(files.map((file) => [file.id, file]))
  return generation.preset.inputs.map((input): MediaCreatorAttachment => {
    const file = byId.get(input.file_id)
    return {
      id: `file-${input.file_id}-${input.position}`, fileId: input.file_id,
      name: file ? visualFileName(file) : `Media ${input.file_id}`,
      kind: input.media_type, role: input.role,
      previewUrl: file ? filePreviewUrl(file) : null,
      posterUrl: file && file.media_type !== "audio" ? visualFilePosterUrl(file) : null,
      status: "ready",
    }
  })
}
