import { Check, FileAudio, Pause, Play, Search, Upload } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, VentureAsset } from "@/types/domain"

export type AssetMode = "sequence" | "sound"

const CATEGORIES = [
  ["all", "All audio"],
  ["music", "Music"],
  ["ambience", "Ambience"],
  ["sfx", "SFX"],
  ["intro", "Intro"],
  ["outro", "Outro"],
  ["other", "Other"],
] as const

const UPLOAD_COLLECTION: Record<string, string> = {
  music: "Music", ambience: "Stingers", sfx: "Stingers",
  intro: "Intros", outro: "Outros", other: "Stingers",
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
  onUpload: (folder: string, file: File) => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState("")
  const eligible = useMemo(() => category === "all" ? assets : assets.filter((asset) => (asset.category || asset.kind || "other") === category), [assets, category])
  const shown = eligible.filter((asset) => `${asset.title || ""} ${asset.text || ""} ${asset.category || asset.kind || ""} ${(asset.tags || []).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const selected = assets.find((asset) => asset.id === selectedId) || null
  const uploadFolder = UPLOAD_COLLECTION[category]
  useEffect(() => setSelectedId(initialSelectedId && assets.some((asset) => asset.id === initialSelectedId) ? initialSelectedId : null), [assets, initialSelectedId])

  async function upload(file?: File) {
    if (!file) return
    setUploading(true); setError("")
    try {
      if (!uploadFolder) throw new Error("Choose an audio category before uploading.")
      await onUpload(uploadFolder, file)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That audio could not be uploaded.") }
    finally { setUploading(false); setDragging(false) }
  }

  async function choose() {
    if (!selected) return
    setChoosing(true); setError("")
    try { await onChoose(selected) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That asset could not be used.") }
    finally { setChoosing(false) }
  }

  return <div className={`tool-panel-body asset-tool${dragging ? " dragging" : ""}`} onDragEnter={(event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); setDragging(true) } }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}>
    <header className="asset-explorer-toolbar">
      <span><b>Audio Library</b><small>{mode === "sound" ? "Place on Audio Track" : "Insert in Sequence"}</small></span>
      <label className="asset-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, folder, or note" /></label>
    </header>
    <div className="asset-explorer-body">
      <aside className="asset-explorer-sidebar" aria-label="Asset categories">
        <span className="eyebrow">Categories</span>
        <nav>{CATEGORIES.map(([value, label]) => <Button key={value} size="sm" variant={category === value ? "secondary" : "ghost"} onClick={() => setCategory(value)}>{label}<small>{value === "all" ? assets.length : assets.filter((asset) => (asset.category || asset.kind || "other") === value).length}</small></Button>)}</nav>
        <label className={`asset-upload${uploadFolder ? "" : " is-disabled"}`}><input type="file" disabled={!uploadFolder} accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = "" }} /><Upload /><span><b>{uploading ? "Uploading…" : uploadFolder ? `Upload to ${category}` : "Choose a category to upload"}</b><small>Existing local upload · provider-free</small></span></label>
      </aside>
      <ScrollArea className="asset-results">
        {shown.length ? shown.map((asset) => {
          const sourceKey = `asset-source:${asset.id}`
          const active = playerPlaying && playingKey === sourceKey
          const isSelected = selectedId === asset.id
          return <article key={asset.id} className={`asset-result${isSelected ? " selected" : ""}`}>
            <span className="asset-art"><FileAudio /></span>
            <button className="asset-result-select" onClick={() => setSelectedId(asset.id)} aria-pressed={isSelected}><b>{asset.title || asset.text || "Untitled asset"}</b><span>{asset.category || asset.kind || "Other"} · {formatDuration(Number(asset.duration_ms || 0) / 1000)} · {asset.scope === "studio" ? "Studio audio" : "Venture audio"}</span></button>
            {asset.filename && <Button variant="ghost" onClick={() => onPlay({ key: sourceKey, url: audioUrl(asset.filename), title: asset.title || asset.text || "Library asset", subtitle: "Source audition", kind: "asset" })}>{active ? <Pause /> : <Play />}{active ? "Pause" : "Audition"}</Button>}
            <span className="asset-result-check" aria-hidden="true">{isSelected && <Check />}</span>
          </article>
        }) : <div className="asset-empty"><Upload /><b>No matching audio</b><p>Try another category or search. Uploading does not call a speech provider.</p></div>}
      </ScrollArea>
    </div>
    <footer className="asset-explorer-footer"><div>{selected ? <><span className="asset-footer-mark"><FileAudio /></span><span><b>{selected.title || selected.text || "Untitled asset"}</b><small>{formatDuration(Number(selected.duration_ms || 0) / 1000)} · selected, not yet placed</small></span></> : <span><b>Select audio</b><small>Auditioning never changes the Production.</small></span>}</div>{error && <p role="alert">{error}</p>}<ActionButton busy={choosing} busyLabel={mode === "sound" ? "Placing audio…" : "Inserting audio…"} disabled={!selected} onClick={() => void choose()}>{chooseLabel || (mode === "sound" ? "Place on Audio Track" : "Insert in Sequence")}</ActionButton></footer>
    {dragging && <div className="asset-drop-overlay"><Upload /><b>{uploadFolder ? `Drop into ${category}` : "Choose a category first"}</b><span>This stays in the Audio Library.</span></div>}
  </div>
}
