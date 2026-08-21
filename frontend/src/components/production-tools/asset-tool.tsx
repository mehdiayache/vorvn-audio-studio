import { Check, FileAudio, Music2, Pause, Play, Search, Upload } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ActionButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, VentureAsset } from "@/types/domain"

export type AssetMode = "sequence" | "music"

export function AssetTool({ assets, mode, chooseLabel, initialSelectedId, playingKey, playerPlaying, onMode, onChoose, onPlay, onUpload }: {
  assets: VentureAsset[]
  mode: AssetMode
  chooseLabel?: string
  initialSelectedId?: number | null
  playingKey?: string
  playerPlaying: boolean
  onMode: (mode: AssetMode) => void
  onChoose: (asset: VentureAsset) => Promise<void>
  onPlay: (source: PlayerSource) => void
  onUpload: (folder: string, file: File) => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [sequenceFolder, setSequenceFolder] = useState("Intros")
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState("")
  const folder = mode === "music" ? "Music" : sequenceFolder
  const eligible = useMemo(() => assets.filter((asset) => asset.folder === folder || asset.collection === folder.toLocaleLowerCase()), [assets, folder])
  const shown = eligible.filter((asset) => `${asset.title || ""} ${asset.text || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const selected = eligible.find((asset) => asset.id === selectedId) || null
  useEffect(() => setSelectedId(initialSelectedId && eligible.some((asset) => asset.id === initialSelectedId) ? initialSelectedId : null), [eligible, folder, initialSelectedId])
  useEffect(() => {
    if (!initialSelectedId || mode !== "sequence") return
    const asset = assets.find((item) => item.id === initialSelectedId)
    if (!asset) return
    const nextFolder = String(asset.folder || asset.collection || "")
    const canonical = ["Intros", "Outros", "Stingers"].find((item) => item.toLocaleLowerCase() === nextFolder.toLocaleLowerCase())
    if (canonical) setSequenceFolder(canonical)
  }, [assets, initialSelectedId, mode])

  async function upload(file?: File) {
    if (!file) return
    setUploading(true); setError("")
    try { await onUpload(folder, file) }
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
      <Tabs value={mode} onValueChange={(value) => onMode(value as AssetMode)}><TabsList><TabsTrigger value="sequence">Sequence clips</TabsTrigger><TabsTrigger value="music">Music bed</TabsTrigger></TabsList></Tabs>
      <label className="asset-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, folder, or note" /></label>
    </header>
    <div className="asset-explorer-body">
      <aside className="asset-explorer-sidebar" aria-label="Asset categories">
        <span className="eyebrow">Categories</span>
        {mode === "sequence" ? <nav>{["Intros", "Outros", "Stingers"].map((item) => <Button key={item} size="sm" variant={sequenceFolder === item ? "secondary" : "ghost"} onClick={() => setSequenceFolder(item)}>{item}<small>{assets.filter((asset) => asset.folder === item || asset.collection === item.toLocaleLowerCase()).length}</small></Button>)}</nav> : <nav><Button size="sm" variant="secondary">Music<small>{eligible.length}</small></Button></nav>}
        <label className="asset-upload"><input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = "" }} /><Upload /><span><b>{uploading ? "Uploading…" : `Upload to ${folder}`}</b><small>MP3, WAV, M4A, AAC, OGG, FLAC</small></span></label>
      </aside>
      <ScrollArea className="asset-results">
        {shown.length ? shown.map((asset) => {
          const sourceKey = `asset-source:${asset.id}`
          const active = playerPlaying && playingKey === sourceKey
          const isSelected = selectedId === asset.id
          return <article key={asset.id} className={`asset-result${isSelected ? " selected" : ""}`}>
            <span className="asset-art">{mode === "music" ? <Music2 /> : <FileAudio />}</span>
            <button className="asset-result-select" onClick={() => setSelectedId(asset.id)} aria-pressed={isSelected}><b>{asset.title || asset.text || "Untitled asset"}</b><span>{asset.folder || asset.collection} · {formatDuration(Number(asset.duration_ms || 0) / 1000)} · Venture asset</span></button>
            {asset.filename && <Button variant="ghost" onClick={() => onPlay({ key: sourceKey, url: audioUrl(asset.filename), title: asset.title || asset.text || "Library asset", subtitle: "Source audition", kind: "asset" })}>{active ? <Pause /> : <Play />}{active ? "Pause" : "Audition"}</Button>}
            <span className="asset-result-check" aria-hidden="true">{isSelected && <Check />}</span>
          </article>
        }) : <div className="asset-empty"><Upload /><b>No matching {folder} audio</b><p>Upload a reusable file here. Uploading does not call a speech provider.</p></div>}
      </ScrollArea>
    </div>
    <footer className="asset-explorer-footer"><div>{selected ? <><span className="asset-footer-mark"><FileAudio /></span><span><b>{selected.title || selected.text || "Untitled asset"}</b><small>{formatDuration(Number(selected.duration_ms || 0) / 1000)} · selected, not yet inserted</small></span></> : <span><b>Select an asset</b><small>Auditioning never inserts or changes the Production.</small></span>}</div>{error && <p role="alert">{error}</p>}<ActionButton busy={choosing} busyLabel={mode === "music" ? "Adding Music…" : "Inserting asset…"} disabled={!selected} onClick={() => void choose()}>{mode === "music" ? "Use as Music Bed" : chooseLabel || "Insert selected asset"}</ActionButton></footer>
    {dragging && <div className="asset-drop-overlay"><Upload /><b>Drop into {folder}</b><span>This stays in the Venture library.</span></div>}
  </div>
}
