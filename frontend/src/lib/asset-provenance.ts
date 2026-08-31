import type { VentureAsset } from "@/types/domain"

export type AssetSource = "generated" | "freesound" | "uploaded" | "library"

type Detail = { label: string; value: string; href?: string }

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function number(value: unknown) {
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

export function assetSourceLine(asset: VentureAsset) {
  const source = assetSource(asset)
  const metadata = assetMetadata(asset)
  if (source === "generated") {
    const model = text(metadata.model) || text(metadata.provider_model_id)
    return model ? `Generated · ${compactModelName(model)}` : "Generated"
  }
  if (source === "freesound") {
    const creator = text(metadata.creator)
    return creator ? `Freesound · ${creator}` : "Freesound"
  }
  if (source === "uploaded") return "Uploaded"
  return "Existing Asset"
}

export function assetDetails(asset: VentureAsset): Detail[] {
  const source = assetSource(asset)
  const metadata = assetMetadata(asset)
  const details: Detail[] = [{ label: "Source", value: assetSourceLine(asset) }]

  if (source === "generated") {
    const model = text(metadata.model) || text(metadata.provider_model_id)
    const created = formatDate(metadata.generated_at)
    const prompt = text(metadata.resolved_prompt) || text(metadata.prompt)
    const seed = number(metadata.seed)
    details.push({ label: "Generator", value: "VORVN Audio · ai.vrn.one" })
    if (model) details.push({ label: "Model", value: modelName(model) })
    if (created) details.push({ label: "Created", value: created })
    if (prompt) details.push({ label: "Prompt", value: prompt })
    if (seed !== null) details.push({ label: "Seed", value: String(seed) })
  } else if (source === "freesound") {
    const creator = text(metadata.creator)
    const license = text(metadata.license)
    const sourceUrl = text(metadata.source_url)
    if (creator) details.push({ label: "Creator", value: creator })
    if (license) details.push({ label: "License", value: license.toUpperCase() })
    if (sourceUrl) details.push({ label: "Original", value: "Open on Freesound", href: sourceUrl })
  } else if (source === "uploaded") {
    const filename = text(metadata.original_filename)
    if (filename) details.push({ label: "Original file", value: filename })
  }

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
