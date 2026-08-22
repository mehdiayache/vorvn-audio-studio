import { Check, FileAudio, Library, Pause, Play, Search, Sparkles, Upload, X } from "lucide-react"
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, VentureAsset } from "@/types/domain"

export type AssetMode = "sequence" | "sound"
export type AudioAssetCategory = "music" | "ambience" | "sfx" | "intro" | "outro" | "other"
export type AssetUploadInput = {
  file: File
  name: string
  category: AudioAssetCategory
  scope: "venture" | "studio"
  tags: string[]
}

type LibraryView = "library" | "upload"
type ScopeFilter = "all" | "venture" | "studio"

const CATEGORIES = [
  ["all", "All audio"], ["music", "Music"], ["ambience", "Ambience"],
  ["sfx", "SFX"], ["intro", "Intro"], ["outro", "Outro"], ["other", "Other"],
] as const
const UPLOAD_CATEGORIES = CATEGORIES.slice(1) as readonly (readonly [AudioAssetCategory, string])[]

const UPLOAD_COLLECTION: Record<AudioAssetCategory, string> = {
  music: "Music", ambience: "Stingers", sfx: "Stingers",
  intro: "Intros", outro: "Outros", other: "Stingers",
}

function assetTitle(asset: VentureAsset) {
  return asset.name || asset.title || asset.text || "Untitled audio"
}

function humanName(file: File) {
  const cleaned = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1) : "Untitled audio"
}

function formatBytes(value?: number | null) {
  if (!value) return ""
  if (value < 1_000_000) return `${Math.round(value / 1_000)} KB`
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)} MB`
}

export function AssetTool({ assets, mode, chooseLabel, initialSelectedId, playingKey, playerPlaying, onChoose, onPlay, onUpload }: {
  assets: VentureAsset[]
  mode: AssetMode
  chooseLabel?: string
  initialSelectedId?: number | null
  playingKey?: string
  playerPlaying: boolean
  onChoose: (asset: VentureAsset) => Promise<void>
  onPlay: (source: PlayerSource) => void
  onUpload: (folder: string, input: AssetUploadInput) => Promise<VentureAsset>
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<LibraryView>("library")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"all" | AudioAssetCategory>("all")
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all")
  const [dragging, setDragging] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [uploadCategory, setUploadCategory] = useState<AudioAssetCategory>("music")
  const [scope, setScope] = useState<"venture" | "studio">("venture")
  const [tags, setTags] = useState<string[]>([])
  const [tagText, setTagText] = useState("")
  const [error, setError] = useState("")

  const eligible = useMemo(() => assets.filter((asset) => {
    const matchesCategory = category === "all" || (asset.category || asset.kind || "other") === category
    const matchesScope = scopeFilter === "all" || (asset.scope || "venture") === scopeFilter
    return matchesCategory && matchesScope
  }), [assets, category, scopeFilter])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const shown = eligible.filter((asset) => `${assetTitle(asset)} ${asset.category || asset.kind || ""} ${(asset.tags || []).join(" ")}`.toLocaleLowerCase().includes(normalizedQuery))
  const selected = assets.find((asset) => asset.id === selectedId) || null

  useEffect(() => {
    if (selectedId && !assets.some((asset) => asset.id === selectedId)) setSelectedId(null)
    if (!selectedId && initialSelectedId && assets.some((asset) => asset.id === initialSelectedId)) setSelectedId(initialSelectedId)
  }, [assets, initialSelectedId, selectedId])

  function chooseFile(next?: File) {
    if (!next) return
    setFile(next); setName(humanName(next)); setError(""); setView("upload")
  }

  function addTag(raw = tagText) {
    const next = raw.trim().replace(/\s+/g, " ").toLocaleLowerCase()
    if (!next) return
    if (next.length > 32) { setError("Keep each tag under 32 characters."); return }
    if (tags.includes(next)) { setTagText(""); return }
    if (tags.length >= 12) { setError("Use at most 12 tags."); return }
    setTags((current) => [...current, next]); setTagText(""); setError("")
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag() }
    if (event.key === "Backspace" && !tagText && tags.length) setTags((current) => current.slice(0, -1))
  }

  async function upload() {
    if (!file) { setError("Choose an audio file first."); return }
    if (!name.trim()) { setError("Give this audio a name."); return }
    setUploading(true); setError("")
    try {
      const uploaded = await onUpload(UPLOAD_COLLECTION[uploadCategory], {
        file, name: name.trim(), category: uploadCategory, scope, tags,
      })
      setSelectedId(uploaded.id); setCategory(uploadCategory); setScopeFilter("all")
      setFile(null); setTags([]); setTagText(""); setView("library")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That audio could not be added.")
    } finally { setUploading(false); setDragging(false) }
  }

  async function choose() {
    if (!selected) return
    setChoosing(true); setError("")
    try { await onChoose(selected) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That audio could not be used.") }
    finally { setChoosing(false) }
  }

  return <div className={`tool-panel-body asset-tool${dragging ? " dragging" : ""}`}
    onDragEnter={(event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); setDragging(true) } }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]) }}>
    <header className="asset-explorer-toolbar">
      <nav className="asset-mode-rail" aria-label="Audio Library modes">
        <button className={view === "library" ? "active" : ""} onClick={() => { setView("library"); setError("") }}><Library />Library</button>
        <button className={view === "upload" ? "active" : ""} onClick={() => { setView("upload"); setError("") }}><Upload />Upload</button>
        <button disabled><Search />Search <small>Soon</small></button>
        <button disabled><Sparkles />Generate <small>Soon</small></button>
      </nav>
      {view === "library" && <label className="asset-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, category, or tag" /></label>}
    </header>

    {view === "library" ? <>
      <div className="asset-explorer-body">
        <aside className="asset-explorer-sidebar" aria-label="Asset categories">
          <span className="eyebrow">Categories</span>
          <nav>{CATEGORIES.map(([value, label]) => <Button key={value} size="sm" variant={category === value ? "secondary" : "ghost"} onClick={() => setCategory(value)}>{label}<small>{value === "all" ? assets.length : assets.filter((asset) => (asset.category || asset.kind || "other") === value).length}</small></Button>)}</nav>
          <div className="asset-scope-filter"><span className="eyebrow">Access</span><div><button className={scopeFilter === "all" ? "active" : ""} onClick={() => setScopeFilter("all")}>All</button><button className={scopeFilter === "studio" ? "active" : ""} onClick={() => setScopeFilter("studio")}>Studio</button><button className={scopeFilter === "venture" ? "active" : ""} onClick={() => setScopeFilter("venture")}>Venture</button></div></div>
          <Button variant="outline" onClick={() => setView("upload")}><Upload />Add audio</Button>
        </aside>
        <ScrollArea className="asset-results">
          {shown.length ? shown.map((asset) => {
            const sourceKey = `asset-source:${asset.id}`
            const active = playerPlaying && playingKey === sourceKey
            const isSelected = selectedId === asset.id
            const facts = [asset.category || asset.kind || "Other", formatDuration(Number(asset.duration_ms || 0) / 1000), asset.scope === "studio" ? "Studio Library" : "This Venture"]
            return <article key={asset.id} className={`asset-result${isSelected ? " selected" : ""}`}>
              <span className="asset-art"><FileAudio /></span>
              <button className="asset-result-select" onClick={() => setSelectedId(asset.id)} aria-pressed={isSelected}><b>{assetTitle(asset)}</b><span>{facts.join(" · ")}</span>{Boolean(asset.tags?.length) && <small>{asset.tags!.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}</small>}</button>
              {asset.filename && <Button variant="ghost" onClick={() => onPlay({ key: sourceKey, url: audioUrl(asset.filename), title: assetTitle(asset), subtitle: "Audio Library audition", kind: "asset" })}>{active ? <Pause /> : <Play />}{active ? "Pause" : "Audition"}</Button>}
              <span className="asset-result-check" aria-hidden="true">{isSelected && <Check />}</span>
            </article>
          }) : <div className="asset-empty"><FileAudio /><b>No matching audio</b><p>Try another category, access level, or search.</p><Button variant="outline" onClick={() => setView("upload")}><Upload />Add audio</Button></div>}
        </ScrollArea>
      </div>
      <footer className="asset-explorer-footer"><div>{selected ? <><span className="asset-footer-mark"><FileAudio /></span><span><b>{assetTitle(selected)}</b><small>{[selected.audio_format?.toUpperCase(), selected.sample_rate ? `${Math.round(selected.sample_rate / 1000)} kHz` : "", selected.channels ? `${selected.channels} ch` : "", formatBytes(selected.size_bytes)].filter(Boolean).join(" · ") || "Selected, not yet placed"}</small></span></> : <span><b>Select audio</b><small>Auditioning never changes the Production.</small></span>}</div>{error && <p role="alert">{error}</p>}<ActionButton busy={choosing} busyLabel={mode === "sound" ? "Placing audio…" : "Inserting audio…"} disabled={!selected} onClick={() => void choose()}>{chooseLabel || (mode === "sound" ? "Place on Audio Track" : "Insert in Sequence")}</ActionButton></footer>
    </> : <section className="asset-upload-workspace">
      <div className="asset-upload-dropzone" data-has-file={Boolean(file)}>
        <input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = "" }} />
        <span><FileAudio /></span>
        {file ? <><b>{file.name}</b><small>{formatBytes(file.size)} · ready to inspect</small><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>Choose another</Button></> : <><b>Drop audio here</b><small>MP3, WAV, M4A, AAC, OGG or FLAC · up to 250 MB</small><Button variant="outline" onClick={() => fileInput.current?.click()}><Upload />Choose file</Button></>}
      </div>
      <div className="asset-upload-fields">
        <label><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Human-readable audio name" /></label>
        <fieldset><legend>Category</legend><div className="asset-category-choice">{UPLOAD_CATEGORIES.map(([value, label]) => <button key={value} type="button" className={uploadCategory === value ? "active" : ""} onClick={() => setUploadCategory(value)}>{label}</button>)}</div></fieldset>
        <label><span>Tags <small>Optional · Enter or comma to add</small></span><div className="asset-tag-entry">{tags.map((tag) => <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag}<X /></button>)}<input value={tagText} onChange={(event) => setTagText(event.target.value)} onKeyDown={onTagKeyDown} onBlur={() => addTag()} placeholder={tags.length ? "Add tag" : "calm, night, transition"} /></div></label>
        <fieldset><legend>Available in</legend><div className="asset-scope-choice"><button type="button" className={scope === "venture" ? "active" : ""} onClick={() => setScope("venture")}><b>This Venture</b><small>Only Productions in this Venture</small></button><button type="button" className={scope === "studio" ? "active" : ""} onClick={() => setScope("studio")}><b>Studio Library</b><small>Reusable across Ventures</small></button></div></fieldset>
      </div>
      <footer className="asset-upload-footer"><span>{file ? "Technical audio facts are inspected when you add it." : "Choose a file to continue."}</span>{error && <p role="alert">{error}</p>}<Button variant="ghost" disabled={uploading} onClick={() => { setView("library"); setError("") }}>Cancel</Button><ActionButton busy={uploading} busyLabel="Adding to Library…" disabled={!file || !name.trim()} onClick={() => void upload()}>Add to Library</ActionButton></footer>
    </section>}
    {dragging && <div className="asset-drop-overlay"><Upload /><b>Drop to prepare this audio</b><span>You can name and classify it before anything is saved.</span></div>}
  </div>
}
