import { AudioLines, Captions, Database, FileText, FolderOpen, Image as ImageIcon, MicVocal, Music2, Search, Upload, Video, Waves } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AudioFileCard } from "@/components/audio-file-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  createLibraryQuery, LIBRARY_SOURCE_OPTIONS, LIBRARY_TYPE_OPTIONS,
  libraryFileType, queryLibraryEntries, queryLibraryFiles,
  type LibraryEntry, type LibrarySourceFilter, type LibraryTypeFilter,
} from "@/features/library/library-query"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PlayerSource, WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import type { CreatorLibraryCreationItem } from "./creator-library-creation-item"

import "./creator-library-browser.css"

function FileCard({ file, selected, onSelect }: { file: WorkspaceFile; selected?: boolean; onSelect?: () => void }) {
  const kind = libraryFileType(file)
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
  initialKind?: LibraryTypeFilter
  selectedFileId?: number | null
  playingKey?: string
  playerPlaying?: boolean
  onSelect?: (file: WorkspaceFile) => void
  onPlay?: (source: PlayerSource) => void
  onUpload?: () => void
}) {
  const [kind, setKind] = useState<LibraryTypeFilter>(initialKind)
  const [source, setSource] = useState<LibrarySourceFilter>("all")
  const [query, setQuery] = useState("")
  const [folderId, setFolderId] = useState("all")
  useEffect(() => setKind(initialKind), [initialKind])
  const libraryQuery = useMemo(() => createLibraryQuery({ type: kind, source, folder: folderId as "all" | "root" | `${number}`, search: query }), [folderId, kind, query, source])
  const visible = useMemo(() => queryLibraryFiles(files, libraryQuery), [files, libraryQuery])
  const visibleCreationItems = useMemo(() => queryLibraryEntries(creationItems.map((item, order) => ({
    item,
    order,
    libraryEntry: {
      type: item.mediaType || "other",
      source: "generated",
      folderId: item.folderId ?? null,
      searchText: (item.searchText || item.mediaType || "generation").toLocaleLowerCase(),
      createdAt: item.createdAt,
      productionAssociated: item.productionAssociated,
      pending: true,
    } satisfies LibraryEntry,
  })), libraryQuery).map(({ item }) => item), [creationItems, libraryQuery])
  return <section className="creator-library-browser">
    <header className="creator-library-browser-tools">
      <div className="creator-library-browser-primary"><label><Search /><Input aria-label="Search Library" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Files" /></label>{folders.length > 0 && <Select value={folderId} onValueChange={setFolderId}><SelectTrigger aria-label="Library folder"><FolderOpen /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All folders</SelectItem><SelectItem value="root">Workspace root</SelectItem>{folders.map((folder) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}</SelectContent></Select>}<Select value={source} onValueChange={(value) => setSource(value as LibrarySourceFilter)}><SelectTrigger aria-label="File source"><SelectValue /></SelectTrigger><SelectContent>{LIBRARY_SOURCE_OPTIONS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>{onUpload && <Button variant="outline" size="sm" onClick={onUpload}><Upload />Upload</Button>}</div>
      <ToggleGroup type="single" value={kind} onValueChange={(value) => value && setKind(value as LibraryTypeFilter)} aria-label="Library file type">
        {LIBRARY_TYPE_OPTIONS.map((item) => <ToggleGroupItem key={item.id} value={item.id}>{item.id === "image" ? <ImageIcon /> : item.id === "video" ? <Video /> : item.id === "audio" ? <AudioLines /> : item.id === "speech" ? <MicVocal /> : item.id === "music" ? <Music2 /> : item.id === "sfx" ? <Waves /> : item.id === "subtitle" ? <Captions /> : item.id === "document" ? <FileText /> : item.id === "data" ? <Database /> : null}{item.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </header>
    {!visible.length && !visibleCreationItems.length ? <div className="creator-library-browser-empty"><FileText /><b>No matching Files</b><span>Created and uploaded Files appear here as soon as they are available.</span></div> : <div className="creator-library-browser-grid">{visibleCreationItems.map((item) => <div key={`creation-${item.id}`} className="creator-library-generation-entry">{item.node}</div>)}{visible.map((file) => {
      const fileKind = libraryFileType(file)
      if (["audio", "speech", "music", "sfx"].includes(fileKind)) {
        const key = `file:${file.id}`
        const url = file.url || (file.filename ? `/media/${encodeURIComponent(file.filename)}` : "")
        return <AudioFileCard key={file.id} file={file} selected={selectedFileId === file.id} onSelect={onSelect ? () => onSelect(file) : undefined} playing={playingKey === key && playerPlaying} onPlay={url && onPlay ? () => onPlay({ key, url, title: file.name || file.title || "Audio", subtitle: fileKind === "speech" ? "Speech" : fileKind === "music" ? "Music" : fileKind === "sfx" ? "Sound effect" : "Audio", kind: "file" }) : undefined} />
      }
      return <FileCard key={file.id} file={file} selected={selectedFileId === file.id} onSelect={onSelect ? () => onSelect(file) : undefined} />
    })}</div>}
  </section>
}
