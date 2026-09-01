import type { VentureAsset } from "@/types/domain"

export type AssetSource = "generated" | "freesound" | "uploaded" | "library"
export type AssetSourceIconName = "sparkles" | "freesound" | "upload" | "archive"
export type AssetDetail = { label: string; value: string; href?: string }

export type AssetSourcePresentation = {
  key: AssetSource
  label: string
  badgeLabel: string
  icon: AssetSourceIconName
}

export type AssetProvenance = {
  source: AssetSource
  presentation: AssetSourcePresentation
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

export const ASSET_SOURCE_PRESENTATION: Record<AssetSource, AssetSourcePresentation> = {
  generated: { key: "generated", label: "Generated", badgeLabel: "AI", icon: "sparkles" },
  freesound: { key: "freesound", label: "Freesound", badgeLabel: "Freesound", icon: "freesound" },
  uploaded: { key: "uploaded", label: "Uploaded", badgeLabel: "Upload", icon: "upload" },
  library: { key: "library", label: "Existing Asset", badgeLabel: "Existing", icon: "archive" },
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

export function assetMetadata(asset: VentureAsset) {
  return { ...(asset.metadata || {}), ...(asset.version_metadata || {}) }
}

export function assetSource(asset: VentureAsset): AssetSource {
  const metadata = assetMetadata(asset)
  const origin = text(metadata.origin).toLocaleLowerCase().replaceAll("_", "-")
  if (origin === "generated" || origin === "director-generation" || metadata.generated === true || Boolean(metadata.generator)) return "generated"
  const externalSource = [origin, metadata.provider, metadata.provider_id, metadata.source]
    .map((value) => text(value).toLocaleLowerCase())
    .join(" ")
  if (externalSource.includes("freesound")) return "freesound"
  if (origin === "upload" || origin === "uploaded") return "uploaded"
  return "library"
}

export function assetSourcePresentation(source: AssetSource) {
  return ASSET_SOURCE_PRESENTATION[source]
}

export function assetProvenance(asset: VentureAsset): AssetProvenance {
  const metadata = assetMetadata(asset)
  const source = assetSource(asset)
  const presentation = assetSourcePresentation(source)
  const provider = text(metadata.provider_id) || text(metadata.provider) || text(metadata.generator)
  const model = text(metadata.provider_model_id) || text(metadata.model)
  const creator = text(metadata.creator)
  const originalFilename = text(metadata.original_filename)
  const qualifiers = source === "generated"
    ? [provider, model ? compactModelName(model) : ""]
    : source === "freesound"
      ? [creator]
      : source === "uploaded"
        ? [originalFilename]
        : []
  const detail = [presentation.label, ...qualifiers.filter(Boolean)].join(" · ")
  return {
    source,
    presentation,
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

export function assetSourceLine(asset: VentureAsset) {
  return assetProvenance(asset).detail
}

export function assetProvenanceDetails(asset: VentureAsset): AssetDetail[] {
  const provenance = assetProvenance(asset)
  const details: AssetDetail[] = []
  if (provenance.source === "generated") {
    if (provenance.provider) details.push({ label: "Provider", value: provenance.provider })
    if (provenance.model) details.push({ label: "Model", value: modelName(provenance.model) })
    if (provenance.generatedAt) details.push({ label: "Created", value: provenance.generatedAt })
    if (provenance.prompt) details.push({ label: "Prompt", value: provenance.prompt })
    if (provenance.seed !== null) details.push({ label: "Seed", value: String(provenance.seed) })
  } else if (provenance.source === "freesound") {
    if (provenance.creator) details.push({ label: "Creator", value: provenance.creator })
    if (provenance.license) details.push({ label: "License", value: provenance.license.toUpperCase() })
    if (provenance.sourceUrl) details.push({ label: "Original", value: "Open on Freesound", href: provenance.sourceUrl })
  } else if (provenance.source === "uploaded" && provenance.originalFilename) {
    details.push({ label: "Original file", value: provenance.originalFilename })
  }
  return details
}

export function assetDetails(asset: VentureAsset): AssetDetail[] {
  const details: AssetDetail[] = [
    { label: "Source", value: assetSourceLine(asset) },
    ...assetProvenanceDetails(asset),
  ]
  if (asset.duration_ms) {
    const seconds = Number(asset.duration_ms) / 1000
    details.push({ label: "Duration", value: `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} sec` })
  }
  if (asset.audio_format) details.push({ label: "Format", value: asset.audio_format.toUpperCase() })
  details.push({
    label: "Scope",
    value: asset.scope === "studio" ? "Studio Library" : "This Venture",
  })
  return details
}
