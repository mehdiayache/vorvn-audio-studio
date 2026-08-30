import { ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"

import { AudioDownloadButton } from "@/components/audio-download-button"
import { AudioFamilyBadge, AudioSourceBadge } from "@/features/sound-scene/audio-identity"
import { audioAssetFamily, audioUsageTags, type AudioFamily } from "@/features/sound-scene/audio-presentation"
import { audioUrl } from "@/lib/api"
import { assetSource, assetSourceLine } from "@/lib/asset-provenance"
import { formatBytes, formatDuration } from "@/lib/format"
import type { AudioAssetCategory, AudioAssetScope, CatalogLicense, CatalogSound, VentureAsset } from "@/types/domain"

import { AssetCategorySelect, AssetScopeSelect } from "./asset-library-controls"

const LICENSE_LABELS: Record<CatalogLicense, string> = { cc0: "CC0", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC" }

function metadataText(asset: VentureAsset, key: string) {
  const value = asset.metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function metadataNumber(asset: VentureAsset, key: string) {
  const value = asset.metadata?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function TagsDisclosure({ tags }: { tags: string[] }) {
  const normalized = [...new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))]
  const [open, setOpen] = useState(normalized.length > 0 && normalized.length <= 6)
  useEffect(() => setOpen(normalized.length > 0 && normalized.length <= 6), [normalized.join("\u0000")])
  return <details className="audio-inspector-tags" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>Tags</span><b>{normalized.length}</b></summary>
    {normalized.length ? <div className="asset-tag-preview">{normalized.map((tag) => <span key={tag}>{tag}</span>)}</div> : <p>No usage tags</p>}
  </details>
}

function DetailGroup({ title, rows }: { title: string; rows: Array<{ label: string; value: string; href?: string }> }) {
  if (!rows.length) return null
  return <section className="audio-inspector-group"><h4>{title}</h4><dl>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.href ? <a href={row.href} target="_blank" rel="noreferrer">{row.value}<ExternalLink /></a> : row.value}</dd></div>)}</dl></section>
}

function ScopeBadge({ scope }: { scope?: string | null }) {
  return <span className="audio-scope-badge">{scope === "studio" ? "Studio" : "Venture"}</span>
}

export function SavedAudioInspector({ asset, title, error }: { asset: VentureAsset; title: string; error?: string }) {
  const source = assetSource(asset)
  const prompt = metadataText(asset, "resolved_prompt") || metadataText(asset, "prompt")
  const sourceRows: Array<{ label: string; value: string; href?: string }> = []
  if (source === "generated") {
    sourceRows.push({ label: "Generator", value: "VORVN Audio · ai.vrn.one" })
    const model = metadataText(asset, "model")
    const created = metadataText(asset, "generated_at")
    const seed = metadataNumber(asset, "seed")
    if (model) sourceRows.push({ label: "Model", value: model.replace(/^stable-audio-3-small-/, "Stable Audio · ").replace(/\bsfx\b/i, "SFX").replace(/\bmusic\b/i, "Music") })
    if (created) sourceRows.push({ label: "Created", value: formatDate(created) })
    if (seed !== null) sourceRows.push({ label: "Seed", value: String(seed) })
  } else if (source === "freesound") {
    const creator = metadataText(asset, "creator")
    const license = metadataText(asset, "license")
    const sourceUrl = metadataText(asset, "source_url")
    if (creator) sourceRows.push({ label: "Creator", value: creator })
    if (license) sourceRows.push({ label: "License", value: license.toUpperCase() })
    if (sourceUrl) sourceRows.push({ label: "Original", value: "Open on Freesound", href: sourceUrl })
  } else if (source === "uploaded") {
    const original = metadataText(asset, "original_filename")
    if (original) sourceRows.push({ label: "Original", value: original })
  }
  const technicalRows = [
    asset.duration_ms ? { label: "Duration", value: formatDuration(asset.duration_ms / 1000) } : null,
    asset.audio_format ? { label: "Format", value: asset.audio_format.toUpperCase() } : null,
    asset.sample_rate ? { label: "Sample rate", value: `${Math.round(asset.sample_rate / 1000)} kHz` } : null,
    asset.channels ? { label: "Channels", value: asset.channels === 1 ? "Mono" : asset.channels === 2 ? "Stereo" : String(asset.channels) } : null,
    asset.size_bytes ? { label: "File size", value: formatBytes(asset.size_bytes) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
  return <aside className="asset-inspector audio-library-inspector" aria-label="Selected Asset details">
    <header className="audio-inspector-header"><div><span className="audio-inspector-source"><AudioSourceBadge source={source} detail={assetSourceLine(asset)} /><AudioFamilyBadge family={audioAssetFamily(asset)} /><ScopeBadge scope={asset.scope} /></span><h3>{title}</h3></div>{asset.filename && <AudioDownloadButton url={audioUrl(asset.filename)} label={title} compact />}</header>
    <TagsDisclosure tags={audioUsageTags(asset)} />
    <DetailGroup title="Origin" rows={sourceRows} />
    {prompt && <section className="audio-inspector-prompt"><h4>Prompt</h4><p>{prompt}</p></section>}
    <DetailGroup title="File" rows={technicalRows} />
    {error && <p className="asset-inspector-error" role="alert">{error}</p>}
  </aside>
}

export function FreesoundAudioInspector({ result, family, category, scope, error, onCategory, onScope }: {
  result: CatalogSound
  family: AudioFamily
  category: AudioAssetCategory
  scope: AudioAssetScope
  error?: string
  onCategory: (value: AudioAssetCategory) => void
  onScope: (value: AudioAssetScope) => void
}) {
  return <aside className="asset-inspector asset-form-inspector audio-library-inspector" aria-label="Selected Freesound details">
    <header className="audio-inspector-header"><div><span className="audio-inspector-source"><AudioSourceBadge source="freesound" detail={`Freesound · ${result.creator}`} /><AudioFamilyBadge family={family} /><ScopeBadge scope={scope} /></span><h3>{result.name}</h3></div></header>
    <TagsDisclosure tags={result.tags} />
    <DetailGroup title="Origin" rows={[{ label: "Creator", value: result.creator }, { label: "License", value: LICENSE_LABELS[result.license] }, { label: "Original", value: "Open on Freesound", href: result.source_url }]} />
    <DetailGroup title="File" rows={[{ label: "Duration", value: formatDuration(result.duration_ms / 1000) }, { label: "Format", value: result.original_format.toUpperCase() }]} />
    <section className="audio-inspector-classify"><h4>Save as</h4><AssetCategorySelect value={category} onChange={onCategory} /><AssetScopeSelect value={scope} onChange={onScope} /></section>
    {error && <p className="asset-inspector-error" role="alert">{error}</p>}
  </aside>
}
