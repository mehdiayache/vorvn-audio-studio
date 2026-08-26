import { AudioLines, Check, FileAudio, Library, Music2, Pause, Play, Search, SlidersHorizontal, Sparkles, Upload, Wind, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { audioUrl, studioApi } from "@/lib/api"
import { assetDetails, assetSource, assetSourceLine, type AssetSource } from "@/lib/asset-provenance"
import { formatDuration } from "@/lib/format"
import type { AudioAssetCategory, AudioAssetScope, CatalogKeepResult, CatalogLicense, CatalogSound, GeneratedKeepResult, PlayerSource, VentureAsset } from "@/types/domain"

import { ASSET_CATEGORIES, AssetCategorySelect, AssetScopeSelect, AssetTagEditor } from "./asset-library-controls"
import { GenerationWorkspace } from "./generation-workspace"

export type AssetMode = "sequence" | "sound"
export type AssetUploadInput = { file: File; name: string; category: AudioAssetCategory; scope: AudioAssetScope; tags: string[] }
export type CatalogKeepInput = { result: CatalogSound; name: string; category: AudioAssetCategory; scope: AudioAssetScope; tags: string[] }
export type GeneratedKeepInput = { candidateId: string; name: string; category: AudioAssetCategory; scope: AudioAssetScope; tags: string[] }

type LibraryView = "library" | "upload" | "search" | "generate"
type ScopeFilter = "all" | "venture" | "studio"
type SourceFilter = "all" | AssetSource
type DurationFilter = "all" | "under-3" | "3-10" | "10-30" | "30-120" | "over-120"
type UsageFilter = "all" | "used" | "unused"
type AssetSort = "recent" | "name" | "duration"

const UPLOAD_COLLECTION: Record<AudioAssetCategory, string> = {
  music: "Music", ambience: "Stingers", sfx: "Stingers", intro: "Intros", outro: "Outros", other: "Stingers",
}
const LICENSE_LABELS: Record<CatalogLicense, string> = { cc0: "CC0", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC" }
function assetTitle(asset: VentureAsset) { return asset.name || asset.title || asset.text || "Untitled audio" }
function humanName(file: File) {
  const cleaned = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1) : "Untitled audio"
}
function formatBytes(value?: number | null) {
  if (!value) return ""
  if (value < 1_000_000) return `${Math.round(value / 1_000)} KB`
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)} MB`
}
function categoryIcon(category: string) {
  if (category === "music") return <Music2 />
  if (category === "ambience") return <Wind />
  if (category === "sfx") return <AudioLines />
  return <FileAudio />
}

export function AssetTool({ assets, mode, chooseLabel, initialSelectedId, productionId, usedAssetIds = [], playingKey, playerPlaying, onChoose, onPlay, onUpload, onKeep, onKeepGenerated }: {
  assets: VentureAsset[]; mode: AssetMode; chooseLabel?: string; initialSelectedId?: number | null; productionId?: number
  usedAssetIds?: number[]
  playingKey?: string; playerPlaying: boolean; onChoose: (asset: VentureAsset) => Promise<void>; onPlay: (source: PlayerSource) => void
  onUpload: (folder: string, input: AssetUploadInput) => Promise<VentureAsset>; onKeep: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onKeepGenerated?: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<LibraryView>("library")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"all" | AudioAssetCategory>("all")
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all")
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all")
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all")
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [assetSort, setAssetSort] = useState<AssetSort>("recent")
  const [dragging, setDragging] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [uploadCategory, setUploadCategory] = useState<AudioAssetCategory>("music")
  const [scope, setScope] = useState<AudioAssetScope>("venture")
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState("")
  const [catalogQuery, setCatalogQuery] = useState("")
  const [catalogLicense, setCatalogLicense] = useState<"all" | CatalogLicense>("all")
  const [catalogDuration, setCatalogDuration] = useState("all")
  const [catalogResults, setCatalogResults] = useState<CatalogSound[]>([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const [catalogError, setCatalogError] = useState("")
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)
  const [keepCategory, setKeepCategory] = useState<AudioAssetCategory>("sfx")
  const [keepScope, setKeepScope] = useState<AudioAssetScope>("studio")
  const [keepingId, setKeepingId] = useState<string | null>(null)
  const [kept, setKept] = useState<Record<string, number>>({})

  const usedIds = useMemo(() => new Set(usedAssetIds), [usedAssetIds])
  const existingTags = useMemo(() => [...new Set(assets.flatMap((asset) => asset.tags || []))]
    .sort((left, right) => left.localeCompare(right)), [assets])
  const eligible = useMemo(() => assets.filter((asset) => {
    const matchesCategory = category === "all" || (asset.category || asset.kind || "other") === category
    const matchesScope = scopeFilter === "all" || (asset.scope || "venture") === scopeFilter
    const seconds = Number(asset.duration_ms || 0) / 1000
    const matchesDuration = durationFilter === "all"
      || durationFilter === "under-3" && seconds < 3
      || durationFilter === "3-10" && seconds >= 3 && seconds < 10
      || durationFilter === "10-30" && seconds >= 10 && seconds < 30
      || durationFilter === "30-120" && seconds >= 30 && seconds < 120
      || durationFilter === "over-120" && seconds >= 120
    const matchesTags = tagFilters.every((tag) => (asset.tags || []).includes(tag))
    const used = usedIds.has(asset.id)
    const matchesUsage = usageFilter === "all"
      || (usageFilter === "used" && used)
      || (usageFilter === "unused" && !used)
    return matchesCategory && matchesScope && matchesDuration && matchesTags && matchesUsage
      && (sourceFilter === "all" || assetSource(asset) === sourceFilter)
  }), [assets, category, durationFilter, scopeFilter, sourceFilter, tagFilters, usageFilter, usedIds])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const shown = eligible.filter((asset) => `${assetTitle(asset)} ${asset.category || asset.kind || ""} ${(asset.tags || []).join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)).sort((left, right) => {
    if (assetSort === "name") return assetTitle(left).localeCompare(assetTitle(right))
    if (assetSort === "duration") return Number(left.duration_ms || 0) - Number(right.duration_ms || 0)
    const leftTime = Date.parse(String(left.created_at || left.updated_at || "")) || left.id
    const rightTime = Date.parse(String(right.created_at || right.updated_at || "")) || right.id
    return rightTime - leftTime
  })
  const activeFilterCount = [category !== "all", scopeFilter !== "all", sourceFilter !== "all", durationFilter !== "all", usageFilter !== "all", assetSort !== "recent"].filter(Boolean).length + tagFilters.length
  const clearFilters = () => { setCategory("all"); setScopeFilter("all"); setSourceFilter("all"); setDurationFilter("all"); setUsageFilter("all"); setTagFilters([]); setAssetSort("recent") }
  const selected = assets.find((asset) => asset.id === selectedId) || null
  const selectedCatalog = catalogResults.find((result) => result.external_id === selectedCatalogId) || null

  useEffect(() => {
    if (selectedId && !assets.some((asset) => asset.id === selectedId)) setSelectedId(null)
    if (!selectedId && initialSelectedId && assets.some((asset) => asset.id === initialSelectedId)) setSelectedId(initialSelectedId)
  }, [assets, initialSelectedId, selectedId])
  useEffect(() => {
    if (selectedCatalogId && !catalogResults.some((item) => item.external_id === selectedCatalogId)) setSelectedCatalogId(null)
  }, [catalogResults, selectedCatalogId])
  useEffect(() => {
    if (view !== "search" || catalogQuery.trim().length < 2) {
      setCatalogSearching(false)
      if (!catalogQuery.trim()) { setCatalogResults([]); setCatalogError("") }
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setCatalogSearching(true); setCatalogError("")
      try {
        const durationMax = catalogDuration === "all" ? null : Number(catalogDuration)
        setCatalogResults(await studioApi.searchFreesound({ query: catalogQuery.trim(), license: catalogLicense, durationMax }, controller.signal))
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setCatalogResults([]); setCatalogError(reason instanceof Error ? reason.message : "Freesound search failed.")
      } finally { if (!controller.signal.aborted) setCatalogSearching(false) }
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [catalogDuration, catalogLicense, catalogQuery, view])

  const openView = (next: LibraryView) => { setView(next); setError(""); setCatalogError("") }
  const chooseFile = (next?: File) => { if (next) { setFile(next); setName(humanName(next)); setError(""); setView("upload") } }
  const resetUpload = () => {
    if (fileInput.current) fileInput.current.value = ""
    setFile(null); setName(""); setUploadCategory("music"); setScope("venture"); setTags([]); setError(""); setDragging(false)
  }
  const upload = async () => {
    if (!file) { setError("Choose an audio file first."); return }
    if (!name.trim()) { setError("Give this audio a name."); return }
    setUploading(true); setError("")
    try {
      const uploaded = await onUpload(UPLOAD_COLLECTION[uploadCategory], { file, name: name.trim(), category: uploadCategory, scope, tags })
      setSelectedId(uploaded.id); setCategory(uploadCategory); setScopeFilter("all"); resetUpload(); setView("library")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That audio could not be added.") }
    finally { setUploading(false); setDragging(false) }
  }
  const choose = async () => {
    if (!selected) return
    setChoosing(true); setError("")
    try { await onChoose(selected) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That audio could not be used.") }
    finally { setChoosing(false) }
  }
  const keep = async () => {
    if (!selectedCatalog) return
    setKeepingId(selectedCatalog.external_id); setCatalogError("")
    try {
      const result = await onKeep(UPLOAD_COLLECTION[keepCategory], { result: selectedCatalog, name: selectedCatalog.name, category: keepCategory, scope: keepScope, tags: selectedCatalog.tags.slice(0, 12) })
      setKept((current) => ({ ...current, [selectedCatalog.external_id]: result.asset.id }))
    } catch (reason) { setCatalogError(reason instanceof Error ? reason.message : "That sound could not be kept.") }
    finally { setKeepingId(null) }
  }

  return <div className={`tool-panel-body asset-tool${dragging ? " dragging" : ""}`}
    onDragEnter={(event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); setDragging(true) } }}
    onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]) }}>
    <header className="asset-workspace-toolbar">
      <strong className="asset-workspace-title">Audio Library</strong>
      <Tabs value={view} onValueChange={(value) => openView(value as LibraryView)} className="asset-mode-tabs">
        <TabsList variant="line" aria-label="Audio Library views">
          <TabsTrigger value="library" aria-label="Library" onClick={() => openView("library")}><Library />Library</TabsTrigger>
          <TabsTrigger value="upload" aria-label="Upload" onClick={() => openView("upload")}><Upload />Upload</TabsTrigger>
          <TabsTrigger value="search" aria-label="Freesound" onClick={() => openView("search")}><Search />Freesound</TabsTrigger>
          <TabsTrigger value="generate" aria-label="Generate" onClick={() => openView("generate")} disabled={!onKeepGenerated}><Sparkles />Generate</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="asset-toolbar-context">
        {view === "library" && <>
          <label className="asset-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your audio" /></label>
          <Popover><PopoverTrigger asChild><Button aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"} variant="outline" className={activeFilterCount ? "asset-filter-trigger is-active" : "asset-filter-trigger"}><SlidersHorizontal />Filters{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</Button></PopoverTrigger><PopoverContent align="end" className="asset-filter-popover">
            <header><div><b>Filter Audio Library</b><small>Filters combine together</small></div>{activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}><X />Clear</Button>}</header>
            <div className="asset-filter-grid">
              <label><span>Category</span><Select value={category} onValueChange={(value) => setCategory(value as "all" | AudioAssetCategory)}><SelectTrigger aria-label="Asset category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{ASSET_CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
              <label><span>Duration</span><Select value={durationFilter} onValueChange={(value) => setDurationFilter(value as DurationFilter)}><SelectTrigger aria-label="Asset duration"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any duration</SelectItem><SelectItem value="under-3">Under 3 seconds</SelectItem><SelectItem value="3-10">3–10 seconds</SelectItem><SelectItem value="10-30">10–30 seconds</SelectItem><SelectItem value="30-120">30 seconds–2 min</SelectItem><SelectItem value="over-120">2 min or longer</SelectItem></SelectContent></Select></label>
              <label><span>Library</span><Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}><SelectTrigger aria-label="Asset library"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All libraries</SelectItem><SelectItem value="studio">Studio Library</SelectItem><SelectItem value="venture">This Venture</SelectItem></SelectContent></Select></label>
              <label><span>Source</span><Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}><SelectTrigger aria-label="Asset source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="generated">Generated</SelectItem><SelectItem value="freesound">Freesound</SelectItem><SelectItem value="uploaded">Uploaded</SelectItem><SelectItem value="library">Existing Library</SelectItem></SelectContent></Select></label>
              <label><span>Usage</span><Select value={usageFilter} onValueChange={(value) => setUsageFilter(value as UsageFilter)}><SelectTrigger aria-label="Asset usage in this Production"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any usage</SelectItem><SelectItem value="used">Used in this Production</SelectItem><SelectItem value="unused">Unused here</SelectItem></SelectContent></Select></label>
              <label><span>Sort</span><Select value={assetSort} onValueChange={(value) => setAssetSort(value as AssetSort)}><SelectTrigger aria-label="Sort assets"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Recently added</SelectItem><SelectItem value="name">Name</SelectItem><SelectItem value="duration">Duration</SelectItem></SelectContent></Select></label>
            </div>
            <fieldset className="asset-tag-filters"><legend>Tags</legend>{existingTags.length ? <div>{existingTags.map((tag) => <label key={tag}><Checkbox checked={tagFilters.includes(tag)} onCheckedChange={(checked) => setTagFilters((current) => checked ? [...current, tag] : current.filter((item) => item !== tag))} /><span>{tag}</span></label>)}</div> : <p>No tags exist in this Library yet.</p>}</fieldset>
          </PopoverContent></Popover>
        </>}
        {view === "search" && <>
          <label className="asset-search"><Search /><Input autoFocus value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Describe the sound you need" /></label>
          <Select value={catalogLicense} onValueChange={(value) => setCatalogLicense(value as "all" | CatalogLicense)}><SelectTrigger aria-label="License"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All licensed audio</SelectItem><SelectItem value="cc0">CC0</SelectItem><SelectItem value="cc-by">Attribution</SelectItem><SelectItem value="cc-by-nc">Attribution NonCommercial</SelectItem></SelectContent></Select>
          <Select value={catalogDuration} onValueChange={setCatalogDuration}><SelectTrigger aria-label="Maximum duration"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any duration</SelectItem><SelectItem value="10">Up to 10 sec</SelectItem><SelectItem value="30">Up to 30 sec</SelectItem><SelectItem value="120">Up to 2 min</SelectItem></SelectContent></Select>
        </>}
      </div>
    </header>

    <div className="asset-workspace-shell">
      {view === "library" ? <section className="asset-view asset-library-view">
        <ScrollArea className="asset-canvas"><div className="asset-result-list">{shown.length ? shown.map((asset) => {
          const sourceKey = `asset-source:${asset.id}`; const active = playerPlaying && playingKey === sourceKey; const isSelected = selectedId === asset.id
          const assetCategory = String(asset.category || asset.kind || "other")
          return <article key={asset.id} className={`asset-result${isSelected ? " selected" : ""}`}><button aria-label={`Select ${assetTitle(asset)}`} className="asset-result-select" onClick={() => setSelectedId(asset.id)} aria-pressed={isSelected}><span className="asset-art" data-category={assetCategory}>{categoryIcon(assetCategory)}</span><span className="asset-result-copy"><b>{assetTitle(asset)}</b><span>{assetSourceLine(asset)}</span><small>{[assetCategory, formatDuration(Number(asset.duration_ms || 0) / 1000), asset.scope === "studio" ? "Studio Library" : "This Venture"].join(" · ")}</small></span>{isSelected && <Check className="asset-selected-check" />}</button>{asset.filename && <OperatorIconButton label={active ? `Pause ${assetTitle(asset)}` : `Audition ${assetTitle(asset)}`} detail="Auditioning does not place this audio." onClick={() => onPlay({ key: sourceKey, url: audioUrl(asset.filename!), title: assetTitle(asset), subtitle: "Audio Library audition", kind: "asset" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>}</article>
        }) : <div className="asset-empty"><FileAudio /><b>No matching audio</b><p>Change the filter or add a new sound.</p><Button variant="outline" onClick={() => openView("upload")}><Upload />Upload audio</Button></div>}</div></ScrollArea>
        <aside className="asset-inspector" aria-label="Selected Asset details">{selected ? <><header><span className="asset-art" data-category={String(selected.category || selected.kind || "other")}>{categoryIcon(String(selected.category || selected.kind || "other"))}</span><div><small>{assetSourceLine(selected)}</small><h3>{assetTitle(selected)}</h3></div></header><dl>{assetDetails(selected).map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.href ? <a href={detail.href} target="_blank" rel="noreferrer">{detail.value}</a> : detail.value}</dd></div>)}</dl></> : <div className="asset-inspector-empty"><FileAudio /><b>Select audio</b><p>Its source, format and availability will appear here.</p></div>}</aside>
        <footer className="asset-action-bar"><div>{selected ? <><b>{assetTitle(selected)}</b><span>{[selected.audio_format?.toUpperCase(), selected.sample_rate ? `${Math.round(selected.sample_rate / 1000)} kHz` : "", selected.channels ? `${selected.channels} ch` : "", formatBytes(selected.size_bytes)].filter(Boolean).join(" · ") || "Ready to use"}</span></> : <><b>{shown.length} available</b><span>Audition freely. Nothing changes until you confirm.</span></>}</div>{error && <p role="alert">{error}</p>}<ActionButton busy={choosing} busyLabel={mode === "sound" ? "Placing audio…" : "Inserting audio…"} disabled={!selected} onClick={() => void choose()}>{chooseLabel || (mode === "sound" ? "Add to Audio Track" : "Insert in Script")}</ActionButton></footer>
      </section> : view === "upload" ? <section className="asset-view asset-upload-view">
        <main className="asset-upload-stage"><input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aif,.aiff" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = "" }} /><div className="asset-upload-dropzone" data-has-file={Boolean(file)}><span><Upload /></span>{file ? <><b>{file.name}</b><p>{formatBytes(file.size)} · ready to inspect</p><Button variant="outline" onClick={() => fileInput.current?.click()}>Choose another file</Button></> : <><b>Drop one audio file here</b><p>MP3, WAV, M4A, AAC, OGG, FLAC or AIFF · up to 250 MB</p><Button onClick={() => fileInput.current?.click()}><Upload />Choose file</Button></>}</div></main>
        <aside className="asset-inspector asset-form-inspector"><header><div><small>Prepare Asset</small><h3>{file ? "Describe this audio" : "Choose a file first"}</h3></div></header>{file ? <div className="asset-inspector-form"><label className="asset-field"><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Human-readable audio name" /></label><AssetCategorySelect value={uploadCategory} onChange={setUploadCategory} /><AssetTagEditor tags={tags} onChange={setTags} onError={setError} placeholder="calm, night, transition" /><AssetScopeSelect value={scope} onChange={setScope} /></div> : <div className="asset-inspector-empty"><FileAudio /><b>No file prepared</b><p>The file stays local until you confirm Add to Library.</p></div>}</aside>
        <footer className="asset-action-bar"><div><b>{file ? file.name : "Upload audio"}</b><span>{file ? "Technical audio facts are inspected when you add it." : "Choose a file to begin."}</span></div>{error && <p role="alert">{error}</p>}<Button variant="ghost" disabled={uploading} onClick={() => { resetUpload(); openView("library") }}>Cancel</Button><ActionButton busy={uploading} busyLabel="Adding to Library…" disabled={!file || !name.trim()} onClick={() => void upload()}>Add to Library</ActionButton></footer>
      </section> : view === "search" ? <section className="asset-view asset-search-view">
        <ScrollArea className="asset-canvas"><div className="asset-result-list">{catalogSearching ? <div className="asset-empty"><Search /><b>Searching Freesound…</b><p>Loading previews and result facts.</p></div> : catalogError ? <div className="asset-empty asset-catalog-error"><Search /><b>Search unavailable</b><p role="alert">{catalogError}</p></div> : catalogResults.length ? catalogResults.map((result) => {
          const sourceKey = `freesound-preview:${result.external_id}`; const active = playerPlaying && playingKey === sourceKey; const isSelected = selectedCatalogId === result.external_id
          return <article key={result.external_id} className={`asset-result${isSelected ? " selected" : ""}`}><button aria-label={`Select ${result.name}`} className="asset-result-select" onClick={() => setSelectedCatalogId(result.external_id)} aria-pressed={isSelected}><span className="asset-art" data-category="sfx"><AudioLines /></span><span className="asset-result-copy"><b>{result.name}</b><span>{result.creator}</span><small>{formatDuration(result.duration_ms / 1000)} · {LICENSE_LABELS[result.license]} · {result.original_format.toUpperCase()}</small></span>{isSelected && <Check className="asset-selected-check" />}</button>{result.preview_url && <OperatorIconButton label={active ? `Pause ${result.name}` : `Audition ${result.name}`} detail="This is a temporary Freesound preview." onClick={() => onPlay({ key: sourceKey, url: result.preview_url!, title: result.name, subtitle: `Freesound preview · ${result.creator}`, kind: "asset" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>}</article>
        }) : <div className="asset-empty"><Search /><b>{catalogQuery.trim().length >= 2 ? "No matching sounds" : "What should be heard?"}</b><p>{catalogQuery.trim().length >= 2 ? "Try another phrase or broaden the filters." : "Describe an object, action, room tone or atmosphere."}</p></div>}</div></ScrollArea>
        <aside className="asset-inspector asset-form-inspector">{selectedCatalog ? <><header><span className="asset-art" data-category="sfx"><AudioLines /></span><div><small>Freesound · {selectedCatalog.creator}</small><h3>{selectedCatalog.name}</h3></div></header><div className="asset-inspector-facts"><span>{formatDuration(selectedCatalog.duration_ms / 1000)}</span><span>{LICENSE_LABELS[selectedCatalog.license]}</span><span>{selectedCatalog.original_format.toUpperCase()}</span></div><div className="asset-inspector-form"><AssetCategorySelect value={keepCategory} onChange={setKeepCategory} /><AssetScopeSelect value={keepScope} onChange={setKeepScope} />{selectedCatalog.tags.length > 0 && <div className="asset-tag-preview">{selectedCatalog.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>}<a className="asset-original-link" href={selectedCatalog.source_url} target="_blank" rel="noreferrer">Open original on Freesound</a></div></> : <div className="asset-inspector-empty"><Search /><b>Select a result</b><p>Then decide its category and where it should be available.</p></div>}</aside>
        <footer className="asset-action-bar"><div><b>{selectedCatalog ? selectedCatalog.name : "Freesound search"}</b><span>{selectedCatalog ? "Keeping downloads and inspects the original file." : "Search results remain external until you Keep one."}</span></div>{catalogError && <p role="alert">{catalogError}</p>}<ActionButton busy={Boolean(selectedCatalog && keepingId === selectedCatalog.external_id)} busyLabel="Keeping…" disabled={!selectedCatalog || Boolean(keepingId) || Boolean(selectedCatalog && kept[selectedCatalog.external_id])} onClick={() => void keep()}>{selectedCatalog && kept[selectedCatalog.external_id] ? <><Check />In Library</> : "Keep in Library"}</ActionButton></footer>
      </section> : onKeepGenerated ? <GenerationWorkspace mode={mode} productionId={productionId} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onKeep={onKeepGenerated} onKept={async (asset, keptCategory, place) => { setSelectedId(asset.id); setCategory(keptCategory); setScopeFilter("all"); if (place) await onChoose(asset); else setView("library") }} /> : null}
    </div>
    {dragging && <div className="asset-drop-overlay"><Upload /><b>Drop to prepare this audio</b><span>Nothing is saved until you confirm.</span></div>}
  </div>
}
