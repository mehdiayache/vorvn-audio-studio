import type { WorkspaceFile } from "@/types/domain"

export type FileSource = "generated" | "uploaded" | "imported"
export type FileSourceIconName = "sparkles" | "freesound" | "upload" | "archive"
export type FileDetail = { label: string; value: string; href?: string }

export type FileSourcePresentation = {
  key: FileSource
  label: string
  badgeLabel: string
  icon: FileSourceIconName
}

export type FileProvenance = {
  source: FileSource
  presentation: FileSourcePresentation
  metadata: Record<string, unknown>
  detail: string
  provider: string
  model: string
  prompt: string
  generatedAt: string
  seed: number | null
  creator: string
  license: string
  sourceUrl: string
  originalFilename: string
}

export const FILE_SOURCE_PRESENTATION: Record<FileSource, FileSourcePresentation> = {
  generated: { key: "generated", label: "Generated", badgeLabel: "AI", icon: "sparkles" },
  uploaded: { key: "uploaded", label: "Uploaded", badgeLabel: "Upload", icon: "upload" },
  imported: { key: "imported", label: "Imported", badgeLabel: "Import", icon: "archive" },
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatDate(value: unknown) {
  const raw = text(value)
  if (!raw) return ""
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(date)
}

function modelName(value: string) {
  return value
    .replace(/^stable-audio-3-small-/, "Stable Audio · ")
    .replace(/\bsfx\b/i, "SFX")
    .replace(/\bmusic\b/i, "Music")
}

function compactModelName(value: string) {
  if (/^stable-audio-3-small-/i.test(value)) return "Stable Audio"
  return modelName(value)
}

export function fileMetadata(file: WorkspaceFile) {
  return { ...(file.metadata || {}), ...(file.version_metadata || {}) }
}

export function fileSource(file: WorkspaceFile): FileSource {
  const metadata = fileMetadata(file)
  const origin = (text(file.source) || text(metadata.origin)).toLocaleLowerCase().replaceAll("_", "-")
  if (origin === "generated") return "generated"
  if (origin === "imported" || origin === "freesound") return "imported"
  if (origin === "uploaded") return "uploaded"
  return "uploaded"
}

export function fileSourcePresentation(source: FileSource) {
  return FILE_SOURCE_PRESENTATION[source]
}

export function fileProvenance(file: WorkspaceFile): FileProvenance {
  const metadata = fileMetadata(file)
  const source = fileSource(file)
  const presentation = fileSourcePresentation(source)
  const provider = text(metadata.provider_id) || text(metadata.provider)
  const model = text(metadata.provider_model_id) || text(metadata.model)
  const creator = text(metadata.creator)
  const originalFilename = text(metadata.original_filename)
  const importedPresentation = source === "imported" && provider.toLowerCase() === "freesound"
    ? { ...presentation, icon: "freesound" as const }
    : presentation
  const qualifiers = source === "generated"
    ? [provider, model ? compactModelName(model) : ""]
    : source === "imported"
      ? [provider ? provider[0]!.toUpperCase() + provider.slice(1) : "", creator]
      : source === "uploaded"
        ? [originalFilename]
        : []
  const detail = [presentation.label, ...qualifiers.filter(Boolean)].join(" · ")
  return {
    source,
    presentation: importedPresentation,
    metadata,
    detail,
    provider,
    model,
    prompt: text(metadata.resolved_prompt) || text(metadata.prompt),
    generatedAt: formatDate(metadata.generated_at),
    seed: finiteNumber(metadata.seed),
    creator,
    license: text(metadata.license),
    sourceUrl: text(metadata.source_url),
    originalFilename,
  }
}

export function fileSourceLine(file: WorkspaceFile) {
  return fileProvenance(file).detail
}

export function fileProvenanceDetails(file: WorkspaceFile): FileDetail[] {
  const provenance = fileProvenance(file)
  const details: FileDetail[] = []
  if (provenance.source === "generated") {
    if (provenance.provider) details.push({ label: "Provider", value: provenance.provider })
    if (provenance.model) details.push({ label: "Model", value: modelName(provenance.model) })
    if (provenance.generatedAt) details.push({ label: "Created", value: provenance.generatedAt })
    if (provenance.prompt) details.push({ label: "Prompt", value: provenance.prompt })
    if (provenance.seed !== null) details.push({ label: "Seed", value: String(provenance.seed) })
  } else if (provenance.source === "imported") {
    if (provenance.provider) details.push({ label: "Provider", value: provenance.provider })
    if (provenance.creator) details.push({ label: "Creator", value: provenance.creator })
    if (provenance.license) details.push({ label: "License", value: provenance.license.toUpperCase() })
    if (provenance.sourceUrl) details.push({ label: "Original", value: "Open on Freesound", href: provenance.sourceUrl })
  } else if (provenance.source === "uploaded" && provenance.originalFilename) {
    details.push({ label: "Original file", value: provenance.originalFilename })
  }
  return details
}

export function fileDetails(file: WorkspaceFile): FileDetail[] {
  const details: FileDetail[] = [
    { label: "Source", value: fileSourceLine(file) },
    ...fileProvenanceDetails(file),
  ]
  if (file.duration_ms) {
    const seconds = Number(file.duration_ms) / 1000
    details.push({ label: "Duration", value: `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} sec` })
  }
  if (file.audio_format) details.push({ label: "Format", value: file.audio_format.toUpperCase() })
  return details
}
