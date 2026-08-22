import { Check, FileAudio, Library, Pause, Play, RotateCcw, Search, Sparkles, Trash2, Upload, X } from "lucide-react"
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useJobExecution } from "@/hooks/use-job-execution"
import { audioUrl, studioApi } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { AudioAssetCategory, AudioAssetScope, AudioGenerationCandidate, CatalogKeepResult, CatalogLicense, CatalogSound, GeneratedKeepResult, PlayerSource, VentureAsset } from "@/types/domain"

export type AssetMode = "sequence" | "sound"
export type AssetUploadInput = {
  file: File
  name: string
  category: AudioAssetCategory
  scope: AudioAssetScope
  tags: string[]
}
export type CatalogKeepInput = {
  result: CatalogSound
  name: string
  category: AudioAssetCategory
  scope: AudioAssetScope
  tags: string[]
}
export type GeneratedKeepInput = {
  candidateId: string
  name: string
  category: AudioAssetCategory
  scope: AudioAssetScope
  tags: string[]
}

type LibraryView = "library" | "upload" | "search" | "generate"
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
const LICENSE_LABELS: Record<CatalogLicense, string> = {
  cc0: "CC0", "cc-by": "CC BY", "cc-by-nc": "CC BY-NC",
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

export function AssetTool({ assets, mode, chooseLabel, initialSelectedId, productionId, playingKey, playerPlaying, onChoose, onPlay, onUpload, onKeep, onKeepGenerated }: {
  assets: VentureAsset[]
  mode: AssetMode
  chooseLabel?: string
  initialSelectedId?: number | null
  productionId?: number
  playingKey?: string
  playerPlaying: boolean
  onChoose: (asset: VentureAsset) => Promise<void>
  onPlay: (source: PlayerSource) => void
  onUpload: (folder: string, input: AssetUploadInput) => Promise<VentureAsset>
  onKeep: (folder: string, input: CatalogKeepInput) => Promise<CatalogKeepResult>
  onKeepGenerated?: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
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
  const [scope, setScope] = useState<AudioAssetScope>("venture")
  const [tags, setTags] = useState<string[]>([])
  const [tagText, setTagText] = useState("")
  const [error, setError] = useState("")
  const [catalogQuery, setCatalogQuery] = useState("")
  const [catalogLicense, setCatalogLicense] = useState<"all" | CatalogLicense>("all")
  const [catalogDuration, setCatalogDuration] = useState("all")
  const [catalogResults, setCatalogResults] = useState<CatalogSound[]>([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const [catalogError, setCatalogError] = useState("")
  const [keepCategory, setKeepCategory] = useState<AudioAssetCategory>("sfx")
  const [keepScope, setKeepScope] = useState<AudioAssetScope>("studio")
  const [keepingId, setKeepingId] = useState<string | null>(null)
  const [kept, setKept] = useState<Record<string, number>>({})
  const generationStorageKey = `audio-studio:generation:${productionId || "library"}`
  const [generationCapability, setGenerationCapability] = useState<"sfx" | "music">("sfx")
  const [generationPrompt, setGenerationPrompt] = useState("")
  const [generationSeconds, setGenerationSeconds] = useState(5)
  const [generationSeed, setGenerationSeed] = useState("")
  const [generationJobId, setGenerationJobId] = useState<string | null>(() => sessionStorage.getItem(generationStorageKey))
  const generationJob = useJobExecution<AudioGenerationCandidate>(generationJobId)
  const [generationStatus, setGenerationStatus] = useState<"checking" | "ready" | "unavailable">("checking")
  const [generationReason, setGenerationReason] = useState("")
  const [generationError, setGenerationError] = useState("")
  const [generationName, setGenerationName] = useState("")
  const [generationCategory, setGenerationCategory] = useState<AudioAssetCategory>("sfx")
  const [generationScope, setGenerationScope] = useState<AudioAssetScope>("studio")
  const [generationTags, setGenerationTags] = useState<string[]>([])
  const [generationTagText, setGenerationTagText] = useState("")
  const [keepingGeneration, setKeepingGeneration] = useState(false)
  const [discardingGeneration, setDiscardingGeneration] = useState(false)
  const generationActive = Boolean(generationJob && ["queued", "running", "retrying"].includes(generationJob.status))
  const generationCandidate = generationJob && ["ok", "warning"].includes(generationJob.status) ? generationJob.result : null

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
        setCatalogResults(await studioApi.searchFreesound({
          query: catalogQuery.trim(), license: catalogLicense, durationMax,
        }, controller.signal))
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setCatalogResults([])
        setCatalogError(reason instanceof Error ? reason.message : "Freesound search failed.")
      } finally {
        if (!controller.signal.aborted) setCatalogSearching(false)
      }
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [catalogDuration, catalogLicense, catalogQuery, view])

  useEffect(() => {
    if (view !== "generate") return
    let current = true
    setGenerationStatus("checking"); setGenerationReason("")
    void studioApi.audioGenerationStatus().then((status) => {
      if (!current) return
      const ready = generationCapability === "sfx" ? status.sfx_ready : status.music_ready
      setGenerationStatus(ready ? "ready" : "unavailable")
      setGenerationReason(status.reason || (ready ? "" : "That generator is not available."))
    }).catch((reason) => {
      if (!current) return
      setGenerationStatus("unavailable")
      setGenerationReason(reason instanceof Error ? reason.message : "Audio Generation is unavailable.")
    })
    return () => { current = false }
  }, [generationCapability, view])

  useEffect(() => {
    setGenerationSeconds((current) => generationCapability === "sfx"
      ? Math.min(30, Math.max(1, current))
      : Math.min(120, Math.max(5, current)))
    setGenerationCategory(generationCapability === "sfx" ? "sfx" : "music")
  }, [generationCapability])

  useEffect(() => {
    if (!generationCandidate || generationName) return
    const concise = generationCandidate.prompt.split(/[.!?]/)[0]?.trim().slice(0, 72)
    setGenerationName(concise || (generationCandidate.capability === "music" ? "Generated music" : "Generated sound effect"))
  }, [generationCandidate, generationName])

  useEffect(() => {
    if (!generationJob || !["failed", "lost", "cancelled"].includes(generationJob.status)) return
    setGenerationError(generationJob.error || generationJob.detail || "Audio could not be generated.")
  }, [generationJob])

  function chooseFile(next?: File) {
    if (!next) return
    setFile(next); setName(humanName(next)); setError(""); setView("upload")
  }

  function resetUpload() {
    if (fileInput.current) fileInput.current.value = ""
    setFile(null); setName(""); setUploadCategory("music"); setScope("venture")
    setTags([]); setTagText(""); setError(""); setDragging(false)
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
      resetUpload(); setView("library")
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

  async function keep(result: CatalogSound) {
    setKeepingId(result.external_id); setCatalogError("")
    try {
      const keptResult = await onKeep(UPLOAD_COLLECTION[keepCategory], {
        result, name: result.name, category: keepCategory, scope: keepScope,
        tags: result.tags.slice(0, 12),
      })
      setKept((current) => ({
        ...current, [result.external_id]: keptResult.asset.id,
      }))
    } catch (reason) {
      setCatalogError(reason instanceof Error ? reason.message : "That sound could not be kept.")
    } finally { setKeepingId(null) }
  }

  async function generateAudio() {
    const prompt = generationPrompt.trim()
    if (!prompt) { setGenerationError("Describe the audio you want to hear."); return }
    setGenerationError("")
    try {
      const parsedSeed = generationSeed.trim() ? Number(generationSeed) : undefined
      if (parsedSeed !== undefined && (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 2_147_483_647)) {
        setGenerationError("Seed must be a whole number between 0 and 2,147,483,647."); return
      }
      const job = await studioApi.enqueueAudioGeneration({
        capability: generationCapability, prompt,
        seconds: generationSeconds, seed: parsedSeed,
        production_id: productionId,
      })
      setGenerationJobId(job.id)
      sessionStorage.setItem(generationStorageKey, job.id)
      setGenerationName(""); setGenerationTags([]); setGenerationTagText("")
    } catch (reason) {
      setGenerationError(reason instanceof Error ? reason.message : "Audio could not be generated.")
    }
  }

  function addGenerationTag(raw = generationTagText) {
    const next = raw.trim().replace(/\s+/g, " ").toLocaleLowerCase()
    if (!next || generationTags.includes(next)) { setGenerationTagText(""); return }
    if (next.length > 32) { setGenerationError("Keep each tag under 32 characters."); return }
    if (generationTags.length >= 12) { setGenerationError("Use at most 12 tags."); return }
    setGenerationTags((current) => [...current, next]); setGenerationTagText(""); setGenerationError("")
  }

  async function keepGeneration() {
    if (!generationCandidate || !onKeepGenerated || !generationName.trim()) return
    setKeepingGeneration(true); setGenerationError("")
    try {
      await onKeepGenerated(UPLOAD_COLLECTION[generationCategory], {
        candidateId: generationCandidate.candidate_id,
        name: generationName.trim(), category: generationCategory,
        scope: generationScope, tags: generationTags,
      })
      setGenerationJobId(null); sessionStorage.removeItem(generationStorageKey)
      setGenerationPrompt(""); setGenerationName(""); setGenerationTags([])
      setCategory(generationCategory); setScopeFilter("all"); setView("library")
    } catch (reason) {
      setGenerationError(reason instanceof Error ? reason.message : "That generated audio could not be kept.")
    } finally { setKeepingGeneration(false) }
  }

  async function discardGeneration() {
    if (!generationJobId) return
    setDiscardingGeneration(true); setGenerationError("")
    try {
      if (generationCandidate) await studioApi.discardGeneratedAudio(generationCandidate.candidate_id)
      setGenerationJobId(null); sessionStorage.removeItem(generationStorageKey)
      setGenerationName(""); setGenerationTags([])
    } catch (reason) {
      setGenerationError(reason instanceof Error ? reason.message : "That candidate could not be discarded.")
    } finally { setDiscardingGeneration(false) }
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
        <button className={view === "search" ? "active" : ""} onClick={() => { setView("search"); setError("") }}><Search />Search</button>
        <button className={view === "generate" ? "active" : ""} onClick={() => { setView("generate"); setError("") }}><Sparkles />Generate</button>
      </nav>
      {view === "library" && <label className="asset-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, category, or tag" /></label>}
      {view === "search" && <span className="asset-catalog-source">Freesound · external previews</span>}
      {view === "generate" && <span className="asset-catalog-source">VORVN Audio · private generation</span>}
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
    </> : view === "search" ? <section className="asset-catalog-workspace">
      <div className="asset-catalog-controls">
        <label className="asset-search"><Search /><Input autoFocus value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="wooden door closing" /></label>
        <Select value={catalogLicense} onValueChange={(value) => setCatalogLicense(value as "all" | CatalogLicense)}><SelectTrigger aria-label="License"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All licensed audio</SelectItem><SelectItem value="cc0">CC0</SelectItem><SelectItem value="cc-by">Attribution</SelectItem><SelectItem value="cc-by-nc">Attribution NonCommercial</SelectItem></SelectContent></Select>
        <Select value={catalogDuration} onValueChange={setCatalogDuration}><SelectTrigger aria-label="Maximum duration"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any duration</SelectItem><SelectItem value="10">Up to 10 sec</SelectItem><SelectItem value="30">Up to 30 sec</SelectItem><SelectItem value="120">Up to 2 min</SelectItem></SelectContent></Select>
      </div>
      <div className="asset-catalog-body">
        <aside className="asset-catalog-keep" aria-label="Keep destination">
          <div><span className="eyebrow">Keep as</span><p>Search results stay external until you Keep one.</p></div>
          <fieldset><legend>Category</legend><div className="asset-category-choice">{UPLOAD_CATEGORIES.map(([value, label]) => <button key={value} type="button" className={keepCategory === value ? "active" : ""} onClick={() => setKeepCategory(value)}>{label}</button>)}</div></fieldset>
          <fieldset><legend>Available in</legend><div className="asset-scope-choice"><button type="button" className={keepScope === "studio" ? "active" : ""} onClick={() => setKeepScope("studio")}><b>Studio Library</b><small>Reusable across Ventures</small></button><button type="button" className={keepScope === "venture" ? "active" : ""} onClick={() => setKeepScope("venture")}><b>This Venture</b><small>Only this Venture</small></button></div></fieldset>
          <small>Audition uses a temporary Freesound preview. Keep downloads and inspects the original before creating one durable Asset.</small>
        </aside>
        <ScrollArea className="asset-results asset-catalog-results">
          {catalogSearching ? <div className="asset-empty"><Search /><b>Searching Freesound…</b><p>Only lightweight result metadata and previews are loading.</p></div> : catalogError ? <div className="asset-empty asset-catalog-error"><Search /><b>Search unavailable</b><p role="alert">{catalogError}</p></div> : catalogResults.length ? catalogResults.map((result) => {
            const sourceKey = `freesound-preview:${result.external_id}`
            const active = playerPlaying && playingKey === sourceKey
            const isKept = Boolean(kept[result.external_id])
            return <article key={result.external_id} className="asset-result asset-catalog-result">
              <span className="asset-art"><FileAudio /></span>
              <div className="asset-result-select"><b>{result.name}</b><span>{formatDuration(result.duration_ms / 1000)} · {result.creator}</span><small><i className="asset-license" data-license={result.license}>{LICENSE_LABELS[result.license]}</i>{result.tags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</small></div>
              {result.preview_url && <Button variant="ghost" onClick={() => onPlay({ key: sourceKey, url: result.preview_url, title: result.name, subtitle: `Freesound preview · ${result.creator}`, kind: "asset" })}>{active ? <Pause /> : <Play />}{active ? "Pause" : "Audition"}</Button>}
              <ActionButton variant={isKept ? "outline" : "default"} busy={keepingId === result.external_id} busyLabel="Keeping…" disabled={Boolean(keepingId) || isKept} onClick={() => void keep(result)}>{isKept ? <><Check />In Library</> : "Keep"}</ActionButton>
            </article>
          }) : <div className="asset-empty"><Search /><b>{catalogQuery.trim().length >= 2 ? "No matching sounds" : "Search Freesound"}</b><p>{catalogQuery.trim().length >= 2 ? "Try another phrase, license, or duration." : "Describe the sound you want to discover."}</p></div>}
        </ScrollArea>
      </div>
    </section> : view === "generate" ? <section className="asset-generation-workspace">
      <div className="asset-generation-compose">
        <div className="asset-generation-kind" aria-label="Generation type"><button type="button" className={generationCapability === "sfx" ? "active" : ""} onClick={() => setGenerationCapability("sfx")}><b>Sound Effect</b><small>1–30 seconds</small></button><button type="button" className={generationCapability === "music" ? "active" : ""} onClick={() => setGenerationCapability("music")}><b>Music</b><small>5–120 seconds</small></button></div>
        <label className="asset-generation-prompt"><span>Describe what should be heard</span><Textarea autoFocus value={generationPrompt} maxLength={500} disabled={generationActive} onChange={(event) => setGenerationPrompt(event.target.value)} placeholder={generationCapability === "sfx" ? "A heavy wooden library door closes softly, warm room tone, no voices" : "A spacious, gentle ambient bed with soft piano fragments, calm and unobtrusive, no vocals"} /><small>{generationPrompt.length}/500</small></label>
        <div className="asset-generation-controls"><label><span>Duration</span><div><Input type="number" min={generationCapability === "sfx" ? 1 : 5} max={generationCapability === "sfx" ? 30 : 120} value={generationSeconds} disabled={generationActive} onChange={(event) => setGenerationSeconds(Number(event.target.value))} /><small>seconds</small></div></label><label><span>Seed <small>Optional</small></span><Input type="number" min="0" max="2147483647" value={generationSeed} disabled={generationActive} onChange={(event) => setGenerationSeed(event.target.value)} placeholder="Random" /></label></div>
        <div className="asset-generation-action"><span>{generationStatus === "checking" ? "Checking generator…" : generationStatus === "ready" ? "A durable Job keeps working if this dialog closes." : generationReason}</span><ActionButton busy={generationActive} busyLabel={generationJob?.detail || "Generating audio…"} disabled={generationStatus !== "ready" || generationActive || !generationPrompt.trim()} onClick={() => void generateAudio()}>{generationJob && ["failed", "lost", "cancelled"].includes(generationJob.status) ? <><RotateCcw />Retry generation</> : <><Sparkles />Generate audio</>}</ActionButton></div>
      </div>
      <aside className="asset-generation-result" data-state={generationCandidate ? "ready" : generationActive ? "working" : "empty"}>
        {generationCandidate ? <>
          <div className="asset-generation-audition"><span><FileAudio /></span><div><b>Generated candidate</b><small>{formatDuration(generationCandidate.duration_ms / 1000)} · WAV · {Math.round((generationCandidate.sample_rate || 0) / 1000)} kHz · seed {generationCandidate.seed}</small></div><Button variant="outline" onClick={() => onPlay({ key: `generated-candidate:${generationCandidate.candidate_id}`, url: generationCandidate.candidate_url, title: generationName || "Generated candidate", subtitle: "Temporary Audio Library candidate", kind: "asset" })}>{playerPlaying && playingKey === `generated-candidate:${generationCandidate.candidate_id}` ? <Pause /> : <Play />}{playerPlaying && playingKey === `generated-candidate:${generationCandidate.candidate_id}` ? "Pause" : "Audition"}</Button></div>
          <label><span>Name</span><Input value={generationName} maxLength={120} onChange={(event) => setGenerationName(event.target.value)} /></label>
          <fieldset><legend>Category</legend><div className="asset-category-choice">{UPLOAD_CATEGORIES.map(([value, label]) => <button key={value} type="button" className={generationCategory === value ? "active" : ""} onClick={() => setGenerationCategory(value)}>{label}</button>)}</div></fieldset>
          <label><span>Tags <small>Optional</small></span><div className="asset-tag-entry">{generationTags.map((tag) => <button key={tag} type="button" onClick={() => setGenerationTags((current) => current.filter((item) => item !== tag))}>{tag}<X /></button>)}<input value={generationTagText} onChange={(event) => setGenerationTagText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addGenerationTag() } }} onBlur={() => addGenerationTag()} placeholder="Add tag" /></div></label>
          <fieldset><legend>Available in</legend><div className="asset-scope-choice"><button type="button" className={generationScope === "studio" ? "active" : ""} onClick={() => setGenerationScope("studio")}><b>Studio Library</b><small>Reusable across Ventures</small></button><button type="button" className={generationScope === "venture" ? "active" : ""} onClick={() => setGenerationScope("venture")}><b>This Venture</b><small>Only this Venture</small></button></div></fieldset>
          <div className="asset-generation-result-actions"><ActionButton variant="ghost" busy={discardingGeneration} busyLabel="Discarding…" disabled={keepingGeneration} onClick={() => void discardGeneration()}><Trash2 />Discard</ActionButton><ActionButton busy={keepingGeneration} busyLabel="Keeping…" disabled={!generationName.trim() || discardingGeneration || !onKeepGenerated} onClick={() => void keepGeneration()}><Check />Keep in Library</ActionButton></div>
        </> : generationActive ? <div className="asset-generation-wait"><Sparkles /><b>{generationJob?.detail || "Generating audio…"}</b><p>You can close Audio Library. This Job will keep running and return here.</p><small>{Math.round((generationJob?.progress || 0) * 100)}%</small></div> : <div className="asset-generation-wait"><FileAudio /><b>{generationJob && ["failed", "lost", "cancelled"].includes(generationJob.status) ? "Generation did not finish" : "Your candidate will appear here"}</b><p>{generationError || "Generate, audition the temporary result, then Keep only what belongs in the Library."}</p></div>}
        {generationError && generationCandidate && <p className="asset-generation-error" role="alert">{generationError}</p>}
      </aside>
    </section> : <section className="asset-upload-workspace">
      <div className="asset-upload-dropzone" data-has-file={Boolean(file)}>
        <input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aif,.aiff" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = "" }} />
        <span><FileAudio /></span>
        {file ? <><b>{file.name}</b><small>{formatBytes(file.size)} · ready to inspect</small><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>Choose another</Button></> : <><b>Drop audio here</b><small>MP3, WAV, M4A, AAC, OGG, FLAC or AIFF · up to 250 MB</small><Button variant="outline" onClick={() => fileInput.current?.click()}><Upload />Choose file</Button></>}
      </div>
      <div className="asset-upload-fields">
        <label><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Human-readable audio name" /></label>
        <fieldset><legend>Category</legend><div className="asset-category-choice">{UPLOAD_CATEGORIES.map(([value, label]) => <button key={value} type="button" className={uploadCategory === value ? "active" : ""} onClick={() => setUploadCategory(value)}>{label}</button>)}</div></fieldset>
        <label><span>Tags <small>Optional · Enter or comma to add</small></span><div className="asset-tag-entry">{tags.map((tag) => <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag}<X /></button>)}<input value={tagText} onChange={(event) => setTagText(event.target.value)} onKeyDown={onTagKeyDown} onBlur={() => addTag()} placeholder={tags.length ? "Add tag" : "calm, night, transition"} /></div></label>
        <fieldset><legend>Available in</legend><div className="asset-scope-choice"><button type="button" className={scope === "venture" ? "active" : ""} onClick={() => setScope("venture")}><b>This Venture</b><small>Only Productions in this Venture</small></button><button type="button" className={scope === "studio" ? "active" : ""} onClick={() => setScope("studio")}><b>Studio Library</b><small>Reusable across Ventures</small></button></div></fieldset>
      </div>
      <footer className="asset-upload-footer"><span>{file ? "Technical audio facts are inspected when you add it." : "Choose a file to continue."}</span>{error && <p role="alert">{error}</p>}<Button variant="ghost" disabled={uploading} onClick={() => { resetUpload(); setView("library") }}>Cancel</Button><ActionButton busy={uploading} busyLabel="Adding to Library…" disabled={!file || !name.trim()} onClick={() => void upload()}>Add to Library</ActionButton></footer>
    </section>}
    {dragging && <div className="asset-drop-overlay"><Upload /><b>Drop to prepare this audio</b><span>You can name and classify it before anything is saved.</span></div>}
  </div>
}
