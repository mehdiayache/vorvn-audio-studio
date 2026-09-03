import { AlertCircle, FileAudio, Library, LoaderCircle, RefreshCw, Search, SlidersHorizontal, Sparkles, Upload, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { ActionButton } from "@/components/operator-action"
import { AudioFileCard, AudioCatalogCard, audioFileTitle } from "@/components/audio-file-card"
import { AudioLibraryLoadingWorkspace } from "@/features/workspace/library/audio-library-loading"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AUDIO_SOURCE_LABELS, AudioSourceBadge, FreesoundMark } from "@/features/sound-scene/audio-identity"
import { audioFileCategory } from "@/features/sound-scene/audio-presentation"
import {
  createLibraryQuery, LIBRARY_SOURCE_OPTIONS, LIBRARY_USAGE_OPTIONS, queryLibraryFiles,
  type LibrarySourceFilter, type LibraryUsageFilter,
} from "@/features/library/library-query"
import { audioUrl, originsApi } from "@/lib/api"
import { fileSource } from "@/lib/file-provenance"
import { formatBytes } from "@/lib/format"
import type { AudioFileCategory, CatalogKeepResult, CatalogLicense, CatalogSound, PlayerSource, WorkspaceFile } from "@/types/domain"

import { FILE_CATEGORIES, FileCategorySelect, FileTagEditor } from "@/features/creator/library/file-library-controls"
import type { CreatorContext } from "@/lib/api"
import type { CreatorResult } from "@/features/creator/creator-contracts"
import { FreesoundAudioInspector, SavedAudioInspector } from "./audio-library-inspector"
import { AudioCreator } from "@/features/creator/audio/audio-creator"

export type AudioLibraryMode = "sequence" | "sound"
export type FileUploadInput = { file: File; name: string; category: AudioFileCategory | null; tags: string[] }
export type CatalogKeepInput = { result: CatalogSound; name: string; category: AudioFileCategory | null; tags: string[] }
export type FileUpdateInput = { name: string; category: AudioFileCategory | null; tags: string[] }

type LibraryView = "library" | "upload" | "search" | "generate"
type DurationFilter = "all" | "under-3" | "3-10" | "10-30" | "30-120" | "over-120"
type FileSort = "recent" | "name" | "duration"

const FILE_LIBRARY = "Files"
function humanName(file: File) {
  const cleaned = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1) : "Untitled audio"
}

export function AudioLibrary({ context, files, loading = false, refreshing = false, resourceError, onRetryResource, mode, chooseLabel, initialSelectedId, usedFileIds = [], playingKey, playerPlaying, transport, onChoose, onPlay, onUpload, onUpdate, onKeep }: {
  context?: CreatorContext; files: WorkspaceFile[]; mode: AudioLibraryMode; chooseLabel?: string; initialSelectedId?: number | null
  loading?: boolean; refreshing?: boolean; resourceError?: string; onRetryResource?: () => Promise<void>
  usedFileIds?: number[]
  transport?: ReactNode
  playingKey?: string; playerPlaying: boolean; onChoose: (file: WorkspaceFile) => Promise<void>; onPlay: (source: PlayerSource) => void
  onUpload: (folder: string, input: FileUploadInput) => Promise<WorkspaceFile>; onKeep: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onUpdate?: (file: WorkspaceFile, input: FileUpdateInput) => Promise<WorkspaceFile>
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<LibraryView>("library")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"all" | "unclassified" | AudioFileCategory>("all")
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>("all")
  const [durationFilter, setDurationFilter] = useState<DurationFilter>("all")
  const [usageFilter, setUsageFilter] = useState<LibraryUsageFilter>("any")
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [fileSort, setFileSort] = useState<FileSort>("recent")
  const [dragging, setDragging] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [choosingId, setChoosingId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [uploadCategory, setUploadCategory] = useState<AudioFileCategory | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState("")
  const [catalogQuery, setCatalogQuery] = useState("")
  const [catalogLicense, setCatalogLicense] = useState<"all" | CatalogLicense>("all")
  const [catalogDuration, setCatalogDuration] = useState("all")
  const [catalogResults, setCatalogResults] = useState<CatalogSound[]>([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const [catalogError, setCatalogError] = useState("")
  const [catalogActionError, setCatalogActionError] = useState("")
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)
  const [keepCategory, setKeepCategory] = useState<AudioFileCategory | null>(null)
  const [keepingId, setKeepingId] = useState<string | null>(null)
  const [kept, setKept] = useState<Record<string, number>>({})

  const audioFiles = useMemo(
    () => queryLibraryFiles(files, createLibraryQuery({ type: "audio" })),
    [files],
  )
  const usedIds = useMemo(() => new Set(usedFileIds), [usedFileIds])
  const existingTags = useMemo(() => [...new Set(audioFiles.flatMap((file) => file.tags || []))]
    .sort((left, right) => left.localeCompare(right)), [audioFiles])
  const commonQuery = useMemo(() => createLibraryQuery({
    type: "audio",
    source: sourceFilter,
    search: query,
    usage: usageFilter,
    sort: fileSort === "name" ? "name" : "recent",
  }), [fileSort, query, sourceFilter, usageFilter])
  const commonFiles = useMemo(() => queryLibraryFiles(audioFiles, commonQuery, { usedFileIds: usedIds }), [audioFiles, commonQuery, usedIds])
  const eligible = useMemo(() => commonFiles.filter((file) => {
    const fileCategory = audioFileCategory(file)
    const matchesCategory = category === "all"
      || (category === "unclassified" ? !fileCategory : fileCategory === category)
    const seconds = Number(file.duration_ms || 0) / 1000
    const matchesDuration = durationFilter === "all"
      || durationFilter === "under-3" && seconds < 3
      || durationFilter === "3-10" && seconds >= 3 && seconds < 10
      || durationFilter === "10-30" && seconds >= 10 && seconds < 30
      || durationFilter === "30-120" && seconds >= 30 && seconds < 120
      || durationFilter === "over-120" && seconds >= 120
    const matchesTags = tagFilters.every((tag) => (file.tags || []).includes(tag))
    return matchesCategory && matchesDuration && matchesTags
  }), [category, commonFiles, durationFilter, tagFilters])
  const shown = [...eligible].sort((left, right) => {
    if (fileSort === "duration") return Number(left.duration_ms || 0) - Number(right.duration_ms || 0)
    return 0
  })
  const activeFilterCount = [category !== "all", sourceFilter !== "all", durationFilter !== "all", usageFilter !== "any", fileSort !== "recent"].filter(Boolean).length + tagFilters.length
  const clearFilters = () => { setCategory("all"); setSourceFilter("all"); setDurationFilter("all"); setUsageFilter("any"); setTagFilters([]); setFileSort("recent") }
  const selected = audioFiles.find((file) => file.id === selectedId) || null
  const selectedCatalog = catalogResults.find((result) => result.external_id === selectedCatalogId) || null
  const selectCatalog = (result: CatalogSound) => {
    if (selectedCatalogId !== result.external_id) setKeepCategory(null)
    setSelectedCatalogId(result.external_id)
  }

  useEffect(() => {
    if (selectedId && !audioFiles.some((file) => file.id === selectedId)) setSelectedId(null)
    if (!selectedId && initialSelectedId && audioFiles.some((file) => file.id === initialSelectedId)) setSelectedId(initialSelectedId)
  }, [audioFiles, initialSelectedId, selectedId])
  useEffect(() => {
    if (selectedCatalogId && !catalogResults.some((item) => item.external_id === selectedCatalogId)) setSelectedCatalogId(null)
  }, [catalogResults, selectedCatalogId])
  useEffect(() => {
    if (view !== "search" || catalogQuery.trim().length < 2) {
      setCatalogSearching(false)
      setCatalogResults([])
      if (!catalogQuery.trim()) setCatalogError("")
      return
    }
    setCatalogSearching(true)
    setCatalogResults([])
    setCatalogError("")
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const durationMax = catalogDuration === "all" ? null : Number(catalogDuration)
        setCatalogResults(await originsApi.searchFreesound({ query: catalogQuery.trim(), license: catalogLicense, durationMax }, controller.signal))
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setCatalogResults([]); setCatalogError(reason instanceof Error ? reason.message : "Freesound search failed.")
      } finally { if (!controller.signal.aborted) setCatalogSearching(false) }
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [catalogDuration, catalogLicense, catalogQuery, view])

  const openView = (next: LibraryView) => { setView(next); setError(""); setCatalogError(""); setCatalogActionError("") }
  const chooseFile = (next?: File) => { if (next) { setFile(next); setName(humanName(next)); setError(""); setView("upload") } }
  const resetUpload = () => {
    if (fileInput.current) fileInput.current.value = ""
    setFile(null); setName(""); setUploadCategory(null); setTags([]); setError(""); setDragging(false)
  }
  const upload = async () => {
    if (!file) { setError("Choose an audio file first."); return }
    if (!name.trim()) { setError("Give this audio a name."); return }
    setUploading(true); setError("")
    try {
      const uploaded = await onUpload(FILE_LIBRARY, { file, name: name.trim(), category: uploadCategory, tags })
      setSelectedId(uploaded.id); setCategory(uploadCategory || "unclassified"); resetUpload(); setView("library")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That audio could not be added.") }
    finally { setUploading(false); setDragging(false) }
  }
  const choose = async (file: WorkspaceFile) => {
    setSelectedId(file.id); setChoosingId(file.id); setError("")
    try { await onChoose(file) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That audio could not be used.") }
    finally { setChoosingId(null) }
  }
  const keep = async (candidate = selectedCatalog, categoryToKeep = keepCategory) => {
    if (!candidate) return
    setKeepingId(candidate.external_id); setCatalogActionError("")
    try {
      const result = await onKeep(FILE_LIBRARY, { result: candidate, name: candidate.name, category: categoryToKeep, tags: [] })
      setKept((current) => ({ ...current, [candidate.external_id]: result.file.id }))
    } catch (reason) { setCatalogActionError(reason instanceof Error ? reason.message : "That sound could not be kept.") }
    finally { setKeepingId(null) }
  }

  const resolveCreatorFile = async (result: CreatorResult) => {
    if (!context) throw new Error("Creator context is unavailable.")
    const overview = await originsApi.workspace(context.workspace_id)
    const file = overview.files.find(({ id }) => id === result.file_ids[0])
    if (!file) throw new Error("The created File is not available yet.")
    return file
  }

  const acceptCreatorResult = async (result: CreatorResult) => {
    if (!context) return
    if (context.project_id) {
      for (const fileId of [...new Set(result.file_ids)]) await originsApi.attachProjectLibraryFile(context.project_id, fileId)
    }
    const created = await resolveCreatorFile(result)
    setSelectedId(created.id)
    setCategory(audioFileCategory(created) || "unclassified")
    await onRetryResource?.()
  }

  return <div className={`tool-panel-body file-tool${dragging ? " dragging" : ""}`}
    onDragEnter={(event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); setDragging(true) } }}
    onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]) }}>
    <header className="file-workspace-toolbar">
      <strong className="file-workspace-title">Audio Library</strong>{refreshing && <span className="file-refreshing" role="status"><LoaderCircle className="spin" />Refreshing…</span>}
      <Tabs value={view} onValueChange={(value) => openView(value as LibraryView)} className="file-mode-tabs">
        <TabsList variant="line" aria-label="Audio Library views">
          <TabsTrigger value="library" aria-label="Library" onClick={() => openView("library")}><Library />Library</TabsTrigger>
          <TabsTrigger value="upload" aria-label="Upload" onClick={() => openView("upload")}><Upload />Upload</TabsTrigger>
          <TabsTrigger value="search" aria-label="Freesound" onClick={() => openView("search")}><FreesoundMark />Freesound</TabsTrigger>
          <TabsTrigger value="generate" aria-label="Generate" onClick={() => openView("generate")} disabled={!context}><Sparkles />Generate</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="file-toolbar-context">
        {view === "library" && <>
          <label className="file-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your audio" /></label>
          <Popover><PopoverTrigger asChild><Button aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"} variant="outline" className={activeFilterCount ? "file-filter-trigger is-active" : "file-filter-trigger"}><SlidersHorizontal />Filters{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</Button></PopoverTrigger><PopoverContent align="end" className="file-filter-popover">
            <header><div><b>Filter Audio Library</b><small>Filters combine together</small></div>{activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}><X />Clear</Button>}</header>
            <div className="file-filter-grid">
              <label><span>Category</span><Select value={category} onValueChange={(value) => setCategory(value as "all" | "unclassified" | AudioFileCategory)}><SelectTrigger aria-label="File category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="unclassified">No category</SelectItem>{FILE_CATEGORIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
              <label><span>Duration</span><Select value={durationFilter} onValueChange={(value) => setDurationFilter(value as DurationFilter)}><SelectTrigger aria-label="File duration"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any duration</SelectItem><SelectItem value="under-3">Under 3 seconds</SelectItem><SelectItem value="3-10">3–10 seconds</SelectItem><SelectItem value="10-30">10–30 seconds</SelectItem><SelectItem value="30-120">30 seconds–2 min</SelectItem><SelectItem value="over-120">2 min or longer</SelectItem></SelectContent></Select></label>
              <label><span>Source</span><Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as LibrarySourceFilter)}><SelectTrigger aria-label="File source"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_SOURCE_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select></label>
              <label><span>Usage</span><Select value={usageFilter} onValueChange={(value) => setUsageFilter(value as LibraryUsageFilter)}><SelectTrigger aria-label="File usage in this Project"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_USAGE_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select></label>
              <label><span>Sort</span><Select value={fileSort} onValueChange={(value) => setFileSort(value as FileSort)}><SelectTrigger aria-label="Sort files"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Recently added</SelectItem><SelectItem value="name">Name</SelectItem><SelectItem value="duration">Duration</SelectItem></SelectContent></Select></label>
            </div>
            <fieldset className="file-tag-filters"><legend>Tags</legend>{existingTags.length ? <div>{existingTags.map((tag) => <label key={tag}><Checkbox checked={tagFilters.includes(tag)} onCheckedChange={(checked) => setTagFilters((current) => checked ? [...current, tag] : current.filter((item) => item !== tag))} /><span>{tag}</span></label>)}</div> : <p>No tags exist in this Library yet.</p>}</fieldset>
          </PopoverContent></Popover>
        </>}
        {view === "search" && <>
          <label className="file-search"><Search /><Input autoFocus value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Describe the sound you need" /></label>
          <Select value={catalogLicense} onValueChange={(value) => setCatalogLicense(value as "all" | CatalogLicense)}><SelectTrigger aria-label="License"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All licensed audio</SelectItem><SelectItem value="cc0">CC0</SelectItem><SelectItem value="cc-by">Attribution</SelectItem><SelectItem value="cc-by-nc">Attribution NonCommercial</SelectItem></SelectContent></Select>
          <Select value={catalogDuration} onValueChange={setCatalogDuration}><SelectTrigger aria-label="Maximum duration"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any duration</SelectItem><SelectItem value="10">Up to 10 sec</SelectItem><SelectItem value="30">Up to 30 sec</SelectItem><SelectItem value="120">Up to 2 min</SelectItem></SelectContent></Select>
        </>}
      </div>
    </header>

    <div className="file-workspace-shell">
      {view === "library" && loading ? <AudioLibraryLoadingWorkspace /> : view === "library" ? <section className="file-view file-library-view">
        <ScrollArea className="file-canvas"><div className="audio-file-card-grid">{shown.length ? shown.map((file) => {
          const sourceKey = `file-source:${file.id}`; const active = playerPlaying && playingKey === sourceKey; const isSelected = selectedId === file.id
          return <AudioFileCard key={file.id} file={file} selected={isSelected} used={usedIds.has(file.id)} playing={active} actionLabel={chooseLabel || (mode === "sound" ? "Add to Timeline" : "Insert")} actionBusy={choosingId === file.id} onSelect={() => setSelectedId(file.id)} onPlay={() => { setSelectedId(file.id); onPlay({ key: sourceKey, url: audioUrl(file.filename!), title: audioFileTitle(file), sourceLabel: AUDIO_SOURCE_LABELS[fileSource(file)], subtitle: "Audio Library audition", kind: "file" }) }} onAction={() => void choose(file)} />
        }) : resourceError ? <div className="file-empty file-resource-error"><AlertCircle /><b>Audio Library unavailable</b><p role="alert">{resourceError}</p>{onRetryResource && <ActionButton variant="outline" busy={refreshing} busyLabel="Retrying…" onClick={() => void onRetryResource().catch(() => undefined)}><RefreshCw />Try again</ActionButton>}</div> : <div className="file-empty"><FileAudio /><b>No matching audio</b><p>Change the filter or add a new sound.</p><Button variant="outline" onClick={() => openView("upload")}><Upload />Upload audio</Button></div>}</div></ScrollArea>
        {selected ? <SavedAudioInspector file={selected} title={audioFileTitle(selected)} error={error} onSave={async (details) => {
          if (!onUpdate) throw new Error("File editing is unavailable.")
          await onUpdate(selected, details)
        }} /> : <aside className="file-inspector" aria-label="Selected File details"><div className="file-inspector-empty"><FileAudio /><b>Select audio</b><p>Origin, optional category, tags, availability and file facts will appear here.</p>{error && <p className="file-inspector-error" role="alert">{error}</p>}</div></aside>}
      </section> : view === "upload" ? <section className="file-view file-upload-view">
        <main className="file-upload-stage"><input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aif,.aiff" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = "" }} /><div className="file-upload-dropzone" data-has-file={Boolean(file)}><span><Upload /></span>{file ? <><b>{file.name}</b><p>{formatBytes(file.size)} · ready to inspect</p><Button variant="outline" onClick={() => fileInput.current?.click()}>Choose another file</Button></> : <><b>Drop one audio file here</b><p>MP3, WAV, M4A, AAC, OGG, FLAC or AIFF · up to 250 MB</p><Button onClick={() => fileInput.current?.click()}><Upload />Choose file</Button></>}</div></main>
        <aside className="file-inspector file-form-inspector"><header><div><span className="audio-inspector-source"><AudioSourceBadge source="uploaded" /></span><h3>{file ? "Describe this audio" : "Choose a file first"}</h3></div></header>{file ? <div className="file-inspector-form"><label className="file-field"><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Human-readable audio name" /></label><FileCategorySelect value={uploadCategory} onChange={setUploadCategory} /><FileTagEditor tags={tags} onChange={setTags} onError={setError} placeholder="calm, night, transition" /></div> : <div className="file-inspector-empty"><FileAudio /><b>No file prepared</b><p>The file stays local until you confirm Add to Library.</p></div>}</aside>
        <footer className="file-action-bar"><div><b>{file ? file.name : "Upload audio"}</b><span>{file ? "Technical audio facts are inspected when you add it." : "Choose a file to begin."}</span></div>{error && <p role="alert">{error}</p>}<Button variant="ghost" disabled={uploading} onClick={() => { resetUpload(); openView("library") }}>Cancel</Button><ActionButton busy={uploading} busyLabel="Adding to Library…" disabled={!file || !name.trim()} onClick={() => void upload()}>Add to Library</ActionButton></footer>
      </section> : view === "search" ? <section className="file-view file-search-view">
        <ScrollArea className="file-canvas"><div className="audio-file-card-grid">{catalogSearching ? <>{Array.from({ length: 8 }, (_, index) => <Skeleton className="audio-file-card-skeleton" key={index} />)}<span className="audio-library-loading-label"><LoaderCircle className="spin" />Searching Freesound…</span></> : catalogError ? <div className="file-empty file-catalog-error"><FreesoundMark /><b>Search unavailable</b><p role="alert">{catalogError}</p></div> : catalogResults.length ? catalogResults.map((result) => {
          const sourceKey = `freesound-preview:${result.external_id}`; const active = playerPlaying && playingKey === sourceKey; const isSelected = selectedCatalogId === result.external_id
          return <AudioCatalogCard key={result.external_id} result={result} selected={isSelected} playing={active} kept={Boolean(kept[result.external_id])} busy={keepingId === result.external_id} onSelect={() => selectCatalog(result)} onPlay={() => { selectCatalog(result); onPlay({ key: sourceKey, url: result.preview_url!, title: result.name, sourceLabel: "Freesound preview", subtitle: result.creator, kind: "file", downloadable: false }) }} onKeep={() => { if (!isSelected) selectCatalog(result); void keep(result, isSelected ? keepCategory : null) }} />
        }) : catalogQuery.trim().length >= 2 ? <div className="file-empty"><FreesoundMark /><b>No matching sounds</b><p>Try another phrase or broaden the filters.</p></div> : <section className="freesound-welcome"><header><span className="file-generation-provider"><FreesoundMark />Freesound</span><h2>What do you want to find?</h2><p>Search millions of community sounds, audition them immediately, then keep only what belongs in your Library.</p></header><div><b>Try a sound</b><span>{["city room tone", "soft transition", "wooden door", "crowd applause"].map((example) => <Button key={example} variant="outline" onClick={() => setCatalogQuery(example)}>{example}</Button>)}</span></div></section>}</div></ScrollArea>
        {selectedCatalog ? <FreesoundAudioInspector result={selectedCatalog} category={keepCategory} error={catalogActionError} onCategory={setKeepCategory} /> : <aside className="file-inspector file-form-inspector"><div className="file-inspector-empty"><FreesoundMark /><b>{catalogQuery.trim().length >= 2 ? "Select a result" : "Search Freesound"}</b><p>{catalogQuery.trim().length >= 2 ? "Review origin, license and source facts. Category stays yours to decide." : "Results are temporary candidates until you keep one."}</p>{catalogError && <p className="file-inspector-error" role="alert">{catalogError}</p>}</div></aside>}
      </section> : context ? <AudioCreator context={context} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onResult={acceptCreatorResult} resultAction={{ label: mode === "sound" ? "Save & Add to Track" : "Save & Insert", busyLabel: mode === "sound" ? "Adding to track…" : "Inserting…", run: async (result) => onChoose(await resolveCreatorFile(result)) }} /> : null}
    </div>
    {transport && <div className="file-library-transport">{transport}</div>}
    {dragging && <div className="file-drop-overlay"><Upload /><b>Drop to prepare this audio</b><span>Nothing is saved until you confirm.</span></div>}
  </div>
}
