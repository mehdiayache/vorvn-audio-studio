import { AudioLines, Captions, Database, FileText, FolderOpen, Image as ImageIcon, MicVocal, Music2, Search, Upload, Video, Waves } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  createLibraryQuery, LIBRARY_SOURCE_OPTIONS, LIBRARY_TYPE_OPTIONS,
  libraryFileType, queryLibraryEntries, queryLibraryFiles,
  type LibraryEntry, type LibrarySourceFilter, type LibraryTypeFilter,
} from "@/features/library/library-query"
import { FileCard } from "@/features/files/file-card"
import { fileDisplayName, fileDisplayUrl } from "@/features/files/file-presentation"
import type { PlayerSource, WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import type { CreatorLibraryCreationItem } from "./creator-library-creation-item"

import "./creator-library-browser.css"

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
      const key = `file:${file.id}`
      const url = fileDisplayUrl(file)
      const select = onSelect ? () => onSelect(file) : undefined
      return <FileCard
        key={file.id}
        file={file}
        interaction={select ? { selected: selectedFileId === file.id, onInvoke: select } : undefined}
        preview={select ? { onOpen: select } : undefined}
        audition={["audio", "speech", "music", "sfx"].includes(fileKind) && url && onPlay ? {
          playing: playingKey === key && Boolean(playerPlaying),
          onToggle: () => onPlay({ key, url, title: fileDisplayName(file), subtitle: fileKind === "speech" ? "Speech" : fileKind === "music" ? "Music" : fileKind === "sfx" ? "Sound effect" : "Audio", kind: "file" }),
        } : undefined}
      />
    })}</div>}
  </section>
}
