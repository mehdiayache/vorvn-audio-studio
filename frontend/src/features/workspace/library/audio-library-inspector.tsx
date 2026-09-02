import { ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"

import { ActionButton } from "@/components/operator-action"
import { AudioDownloadButton } from "@/components/audio-download-button"
import { AudioFamilyBadge, AudioSourceBadge } from "@/features/sound-scene/audio-identity"
import { audioFileCategory, audioUsageTags } from "@/features/sound-scene/audio-presentation"
import { Input } from "@/components/ui/input"
import { audioUrl } from "@/lib/api"
import { fileProvenance, fileProvenanceDetails } from "@/lib/file-provenance"
import { formatBytes, formatDuration } from "@/lib/format"
import type { AudioFileCategory, CatalogLicense, CatalogSound, WorkspaceFile } from "@/types/domain"

import { FileCategorySelect, FileTagEditor } from "./file-library-controls"

const LICENSE_LABELS: Record<CatalogLicense, string> = { cc0: "CC0", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC" }

function TagsDisclosure({ tags, label = "Tags", empty = "No tags" }: { tags: string[]; label?: string; empty?: string }) {
  const normalized = [...new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))]
  const [open, setOpen] = useState(normalized.length > 0 && normalized.length <= 6)
  useEffect(() => setOpen(normalized.length > 0 && normalized.length <= 6), [normalized.join("\u0000")])
  return <details className="audio-inspector-tags" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{label}</span><b>{normalized.length}</b></summary>
    {normalized.length ? <div className="file-tag-preview">{normalized.map((tag) => <span key={tag}>{tag}</span>)}</div> : <p>{empty}</p>}
  </details>
}

function DetailGroup({ title, rows }: { title: string; rows: Array<{ label: string; value: string; href?: string }> }) {
  if (!rows.length) return null
  return <section className="audio-inspector-group"><h4>{title}</h4><dl>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.href ? <a href={row.href} target="_blank" rel="noreferrer">{row.value}<ExternalLink /></a> : row.value}</dd></div>)}</dl></section>
}

export function SavedAudioInspector({ file, title, error, onSave }: {
  file: WorkspaceFile
  title: string
  error?: string
  onSave: (details: { name: string; category: AudioFileCategory | null; tags: string[] }) => Promise<void>
}) {
  const provenance = fileProvenance(file)
  const source = provenance.source
  const category = audioFileCategory(file)
  const [draftName, setDraftName] = useState(title)
  const [draftCategory, setDraftCategory] = useState<AudioFileCategory | null>(category)
  const [draftTags, setDraftTags] = useState(audioUsageTags(file))
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")
  useEffect(() => {
    setDraftName(title)
    setDraftCategory(audioFileCategory(file))
    setDraftTags(audioUsageTags(file))
    setEditError("")
  }, [file.id, file.updated_at, title])
  const sourceRows = fileProvenanceDetails(file).filter(({ label }) => label !== "Prompt")
  const technicalRows = [
    file.duration_ms ? { label: "Duration", value: formatDuration(file.duration_ms / 1000) } : null,
    file.audio_format ? { label: "Format", value: file.audio_format.toUpperCase() } : null,
    file.sample_rate ? { label: "Sample rate", value: `${Math.round(file.sample_rate / 1000)} kHz` } : null,
    file.channels ? { label: "Channels", value: file.channels === 1 ? "Mono" : file.channels === 2 ? "Stereo" : String(file.channels) } : null,
    file.size_bytes ? { label: "File size", value: formatBytes(file.size_bytes) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
  const sourceTags = Array.isArray(provenance.metadata.source_tags) ? provenance.metadata.source_tags.filter((tag): tag is string => typeof tag === "string") : []
  const save = async () => {
    if (!draftName.trim()) { setEditError("Give this audio a name."); return }
    setSaving(true); setEditError("")
    try { await onSave({ name: draftName.trim(), category: draftCategory, tags: draftTags }) }
    catch (reason) { setEditError(reason instanceof Error ? reason.message : "Library details could not be saved.") }
    finally { setSaving(false) }
  }
  return <aside className="file-inspector audio-library-inspector" aria-label="Selected File details">
    <header className="audio-inspector-header"><div><span className="audio-inspector-source"><AudioSourceBadge source={source} detail={provenance.detail} />{category && <AudioFamilyBadge family={category} />}</span><h3>{title}</h3></div>{file.filename && <AudioDownloadButton url={audioUrl(file.filename)} label={title} compact />}</header>
    <section className="audio-inspector-classify"><h4>Library details</h4><div className="file-inspector-form"><label className="file-field"><span>Name</span><Input value={draftName} maxLength={120} onChange={(event) => setDraftName(event.target.value)} /></label><FileCategorySelect value={draftCategory} onChange={setDraftCategory} /><FileTagEditor tags={draftTags} onChange={setDraftTags} onError={setEditError} /><ActionButton busy={saving} busyLabel="Saving…" disabled={!draftName.trim()} onClick={() => void save()}>Save changes</ActionButton></div></section>
    {sourceTags.length > 0 && <TagsDisclosure tags={sourceTags} label="Source tags" />}
    <DetailGroup title="Origin" rows={sourceRows} />
    {provenance.prompt && <section className="audio-inspector-prompt"><h4>Prompt</h4><p>{provenance.prompt}</p></section>}
    <DetailGroup title="File" rows={technicalRows} />
    {(editError || error) && <p className="file-inspector-error" role="alert">{editError || error}</p>}
  </aside>
}

export function FreesoundAudioInspector({ result, category, error, onCategory }: {
  result: CatalogSound
  category: AudioFileCategory | null
  error?: string
  onCategory: (value: AudioFileCategory | null) => void
}) {
  return <aside className="file-inspector file-form-inspector audio-library-inspector" aria-label="Selected Freesound details">
    <header className="audio-inspector-header"><div><span className="audio-inspector-source"><AudioSourceBadge source="freesound" detail={`Freesound · ${result.creator}`} /></span><h3>{result.name}</h3></div></header>
    <TagsDisclosure tags={result.tags} label="Freesound tags" />
    <DetailGroup title="Origin" rows={[{ label: "Creator", value: result.creator }, { label: "License", value: LICENSE_LABELS[result.license] }, ...(result.provider_category ? [{ label: "Freesound class", value: [result.provider_category, result.provider_subcategory].filter(Boolean).join(" · ") }] : []), { label: "Original", value: "Open on Freesound", href: result.source_url }]} />
    <DetailGroup title="File" rows={[{ label: "Duration", value: formatDuration(result.duration_ms / 1000) }, { label: "Format", value: result.original_format.toUpperCase() }]} />
    <section className="audio-inspector-classify"><h4>Save as</h4><FileCategorySelect value={category} onChange={onCategory} /></section>
    {error && <p className="file-inspector-error" role="alert">{error}</p>}
  </aside>
}
