import { FileAudio, Music2, Pause, Play, Search, Upload } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { PlayerSource, VentureAsset } from "@/types/domain"

export type AssetMode = "sequence" | "music"

export function AssetTool({ assets, mode, chooseLabel, playingKey, playerPlaying, onMode, onChoose, onPlay, onUpload }: {
  assets: VentureAsset[]
  mode: AssetMode
  chooseLabel?: string
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
  const folder = mode === "music" ? "Music" : sequenceFolder
  const eligible = useMemo(() => assets.filter((asset) => asset.folder === folder || asset.collection === folder.toLocaleLowerCase()), [assets, folder])
  const shown = eligible.filter((asset) => `${asset.title || ""} ${asset.text || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  async function upload(file?: File) {
    if (!file) return
    setUploading(true)
    try { await onUpload(folder, file) } finally { setUploading(false); setDragging(false) }
  }
  return <div className={`tool-panel-body asset-tool${dragging ? " dragging" : ""}`} onDragEnter={(event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); setDragging(true) } }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}>
    <Tabs value={mode} onValueChange={(value) => onMode(value as AssetMode)}><TabsList><TabsTrigger value="sequence">Sequence clips</TabsTrigger><TabsTrigger value="music">Music bed</TabsTrigger></TabsList></Tabs>
    {mode === "sequence" && <div className="asset-folders">{["Intros", "Outros", "Stingers"].map((item) => <Button key={item} size="sm" variant={sequenceFolder === item ? "secondary" : "ghost"} onClick={() => setSequenceFolder(item)}>{item}</Button>)}</div>}
    <label className="asset-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this Venture’s library" /></label>
    <label className="asset-upload"><input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = "" }} /><Upload /><span><b>{uploading ? "Uploading…" : `Drop audio into ${folder}`}</b><small>or choose MP3, WAV, M4A, AAC, OGG, or FLAC · free</small></span></label>
    <ScrollArea className="asset-results">
      {shown.length ? shown.map((asset) => {
        const sourceKey = `asset-source:${asset.id}`
        const active = playerPlaying && playingKey === sourceKey
        return <article key={asset.id} className="asset-result">
          <span className="asset-art">{mode === "music" ? <Music2 /> : <FileAudio />}</span>
          <div><b>{asset.title || asset.text || "Untitled asset"}</b><span>{asset.folder || asset.collection} · {formatDuration(Number(asset.duration_ms || 0) / 1000)}</span></div>
          {asset.filename && <Button variant="ghost" onClick={() => onPlay({ key: sourceKey, url: audioUrl(asset.filename), title: asset.title || asset.text || "Library asset", subtitle: "Source audition", kind: "asset" })}>{active ? <Pause /> : <Play />}{active ? "Pause" : "Play"}</Button>}
          <Button variant="outline" onClick={() => void onChoose(asset)}>{mode === "music" ? "Use as bed" : chooseLabel || "Insert"}</Button>
        </article>
      }) : <div className="asset-empty"><Upload /><b>No matching {folder} audio</b><p>Drop a reusable file above. Uploading never calls Alibaba.</p></div>}
    </ScrollArea>
    {dragging && <div className="asset-drop-overlay"><Upload /><b>Drop into {folder}</b><span>This stays in the Venture library.</span></div>}
  </div>
}
