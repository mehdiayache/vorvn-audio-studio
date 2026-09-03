import { AudioLines, Captions, FileText, FolderOpen, Image as ImageIcon, MicVocal, Music2, Search, Upload, Video, Waves } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AudioFileCard } from "@/components/audio-file-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { audioFileCategory } from "@/features/sound-scene/audio-presentation"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PlayerSource, WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import type { CreatorLibraryCreationItem } from "./creator-library-creation-item"

import "./creator-library-browser.css"

export type CreatorLibraryKind = "all" | "image" | "video" | "audio" | "speech" | "music" | "sfx" | "subtitle"

const kinds: ReadonlyArray<{ id: CreatorLibraryKind; label: string }> = [
  { id: "all", label: "All" }, { id: "image", label: "Images" }, { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" }, { id: "speech", label: "Speech" }, { id: "music", label: "Music" }, { id: "sfx", label: "Sound Effect" }, { id: "subtitle", label: "Subtitles" },
]

export function creatorLibraryKind(file: WorkspaceFile): Exclude<CreatorLibraryKind, "all"> | "other" {
  if (file.media_type === "image" || file.media_type === "video") return file.media_type
  const explicit = String(file.category || file.file_category || "").toLowerCase()
  const tags = new Set((file.tags || []).map((tag) => String(tag).toLowerCase()))
  if (file.mime_type?.includes("subtitle") || /\.(srt|vtt)$/i.test(String(file.filename || "")) || tags.has("subtitle")) return "subtitle"
  const audio = audioFileCategory(file)
  if (audio === "music") return "music"
  if (audio === "sfx" || audio === "ambience") return "sfx"
  if (explicit === "speech" || tags.has("speech") || tags.has("voice")) return "speech"
  if (file.media_type === "audio") return "audio"
  return "other"
}

function FileCard({ file, selected, onSelect }: { file: WorkspaceFile; selected?: boolean; onSelect?: () => void }) {
  const kind = creatorLibraryKind(file)
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : kind === "subtitle" ? Captions : FileText
  const name = file.name || file.title || file.filename || "Untitled File"
  const url = file.url || (file.filename ? `/media/${encodeURIComponent(file.filename)}` : "")
  return <article className={cn("creator-library-file-card", `is-${kind}`, selected && "is-selected")}>
    <button type="button" aria-label={`Preview ${name}`} aria-pressed={selected} onClick={onSelect}>
      <span className="creator-library-file-preview">{kind === "image" && url ? <img src={url} alt="" loading="lazy" /> : kind === "video" && url ? <video src={url} muted preload="metadata" /> : <Icon />}</span>
      <span className="creator-library-file-copy"><b title={name}>{name}</b><small>{kind === "subtitle" ? "Subtitle" : String(kind).replace(/^./, (value) => value.toUpperCase())}{file.duration_ms ? ` · ${formatDuration(file.duration_ms / 1000)}` : ""}</small></span>
    </button>
  </article>
}

export function CreatorLibraryBrowser({ files, folders = [], creationItems = [], initialKind = "all", selectedFileId, playingKey, playerPlaying, onSelect, onPlay, onUpload }: {
  files: WorkspaceFile[]
  folders?: WorkspaceFolder[]
  creationItems?: CreatorLibraryCreationItem[]
  initialKind?: CreatorLibraryKind
  selectedFileId?: number | null
  playingKey?: string
  playerPlaying?: boolean
  onSelect?: (file: WorkspaceFile) => void
  onPlay?: (source: PlayerSource) => void
  onUpload?: () => void
}) {
  const [kind, setKind] = useState<CreatorLibraryKind>(initialKind)
  const [query, setQuery] = useState("")
  const [folderId, setFolderId] = useState("all")
  useEffect(() => setKind(initialKind), [initialKind])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return files.filter((file) => (folderId === "all" || String(file.folder_id || "root") === folderId) && (kind === "all" || creatorLibraryKind(file) === kind) && (!normalized || `${file.name || ""} ${file.title || ""} ${(file.tags || []).join(" ")}`.toLowerCase().includes(normalized)))
  }, [files, folderId, kind, query])
  const visibleCreationItems = creationItems.filter((item) => kind === "all" || item.mediaType === kind)
  return <section className="creator-library-browser">
    <header className="creator-library-browser-tools">
      <div className="creator-library-browser-primary"><label><Search /><Input aria-label="Search Library" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Files" /></label>{folders.length > 0 && <Select value={folderId} onValueChange={setFolderId}><SelectTrigger aria-label="Library folder"><FolderOpen /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All folders</SelectItem><SelectItem value="root">Workspace root</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}</SelectContent></Select>}{onUpload && <Button variant="outline" size="sm" onClick={onUpload}><Upload />Upload</Button>}</div>
      <ToggleGroup type="single" value={kind} onValueChange={(value) => value && setKind(value as CreatorLibraryKind)} aria-label="Library file type">
        {kinds.map((item) => <ToggleGroupItem key={item.id} value={item.id}>{item.id === "image" ? <ImageIcon /> : item.id === "video" ? <Video /> : item.id === "audio" ? <AudioLines /> : item.id === "speech" ? <MicVocal /> : item.id === "music" ? <Music2 /> : item.id === "sfx" ? <Waves /> : item.id === "subtitle" ? <Captions /> : null}{item.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </header>
    {!visible.length && !visibleCreationItems.length ? <div className="creator-library-browser-empty"><FileText /><b>No matching Files</b><span>Created and uploaded Files appear here as soon as they are available.</span></div> : <div className="creator-library-browser-grid">{visibleCreationItems.map((item) => <div key={`creation-${item.id}`} className="creator-library-generation-entry">{item.node}</div>)}{visible.map((file) => {
      const fileKind = creatorLibraryKind(file)
      if (["audio", "speech", "music", "sfx"].includes(fileKind)) {
        const key = `file:${file.id}`
        const url = file.url || (file.filename ? `/media/${encodeURIComponent(file.filename)}` : "")
        return <AudioFileCard key={file.id} file={file} selected={selectedFileId === file.id} onSelect={onSelect ? () => onSelect(file) : undefined} playing={playingKey === key && playerPlaying} onPlay={url && onPlay ? () => onPlay({ key, url, title: file.name || file.title || "Audio", subtitle: fileKind === "speech" ? "Speech" : fileKind === "music" ? "Music" : fileKind === "sfx" ? "Sound effect" : "Audio", kind: "file" }) : undefined} />
      }
      return <FileCard key={file.id} file={file} selected={selectedFileId === file.id} onSelect={onSelect ? () => onSelect(file) : undefined} />
    })}</div>}
  </section>
}
