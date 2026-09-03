import { fileSource, type FileSource } from "@/lib/file-provenance"
import type { WorkspaceFile } from "@/types/domain"

export type LibraryScope = "production" | "folder" | "workspace"
export type LibraryFileType = "image" | "video" | "audio" | "speech" | "music" | "sfx" | "document" | "data" | "subtitle"
export type LibraryTypeFilter = "all" | LibraryFileType
export type LibrarySourceFilter = "all" | FileSource
export type LibraryFolderFilter = "all" | "root" | `${number}`
export type LibraryUsageFilter = "any" | "used" | "unused"
export type LibrarySort = "recent" | "used" | "name"

export type LibraryQuery = {
  scope: LibraryScope
  type: LibraryTypeFilter
  source: LibrarySourceFilter
  folder: LibraryFolderFilter
  search: string
  usage: LibraryUsageFilter
  sort: LibrarySort
}

export type LibraryQueryContext = {
  productionFileIds?: ReadonlySet<number>
  usedFileIds?: ReadonlySet<number>
  currentFolderId?: number | null
}

export const LIBRARY_SCOPE_OPTIONS: ReadonlyArray<{ id: LibraryScope; label: string }> = [
  { id: "production", label: "This Production" },
  { id: "folder", label: "Current Folder" },
  { id: "workspace", label: "Workspace" },
]

export const LIBRARY_TYPE_OPTIONS: ReadonlyArray<{ id: LibraryTypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "speech", label: "Speech" },
  { id: "music", label: "Music" },
  { id: "sfx", label: "Sound Effect" },
  { id: "document", label: "Documents" },
  { id: "data", label: "Data" },
  { id: "subtitle", label: "Subtitles" },
]

export const LIBRARY_SOURCE_OPTIONS: ReadonlyArray<{ id: LibrarySourceFilter; label: string }> = [
  { id: "all", label: "All sources" },
  { id: "generated", label: "Generated" },
  { id: "uploaded", label: "Uploaded" },
  { id: "imported", label: "Imported" },
]

export const LIBRARY_USAGE_OPTIONS: ReadonlyArray<{ id: LibraryUsageFilter; label: string }> = [
  { id: "any", label: "Any usage" },
  { id: "used", label: "Used here" },
  { id: "unused", label: "Unused here" },
]

export const LIBRARY_SORT_OPTIONS: ReadonlyArray<{ id: LibrarySort; label: string }> = [
  { id: "recent", label: "Recently added" },
  { id: "used", label: "Used here first" },
  { id: "name", label: "Name" },
]

export function createLibraryQuery(overrides: Partial<LibraryQuery> = {}): LibraryQuery {
  return {
    scope: "workspace",
    type: "all",
    source: "all",
    folder: "all",
    search: "",
    usage: "any",
    sort: "recent",
    ...overrides,
  }
}

function normalized(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase()
}

export function libraryFileName(file: WorkspaceFile) {
  return file.name || file.title || file.filename || "Untitled File"
}

export function libraryFileType(file: WorkspaceFile): LibraryFileType | "other" {
  if (file.media_type === "image" || file.media_type === "video") return file.media_type
  const category = normalized(file.category || file.file_category)
  const tags = new Set((file.tags || []).map(normalized))
  const filename = normalized(file.filename)
  const mimeType = normalized(file.mime_type)
  if (file.media_type === "subtitle" || mimeType.includes("subtitle") || /\.(srt|vtt)$/.test(filename) || tags.has("subtitle")) return "subtitle"
  if (file.media_type === "document") return "document"
  if (file.media_type === "data" || file.media_type === "archive") return "data"
  if (category === "music" || category === "intro" || category === "outro") return "music"
  if (category === "sfx" || category === "ambience") return "sfx"
  if (category === "speech" || tags.has("speech") || tags.has("voice")) return "speech"
  if (file.media_type === "audio") return "audio"
  return "other"
}

export function libraryFileSearchText(file: WorkspaceFile) {
  const sourceTags = Array.isArray(file.metadata?.source_tags) ? file.metadata.source_tags : []
  return [
    libraryFileName(file), file.filename, file.category, file.file_category,
    file.mime_type, file.source, ...(file.tags || []), ...sourceTags,
  ].filter(Boolean).join(" ").toLocaleLowerCase()
}

export type LibraryEntry = {
  fileId?: number
  type: LibraryFileType | "other"
  source: FileSource
  folderId: number | null
  searchText: string
  createdAt?: string | null
  productionAssociated?: boolean
  usedHere?: boolean
  pending?: boolean
}

export function libraryFileEntry(file: WorkspaceFile, context: LibraryQueryContext = {}): LibraryEntry {
  return {
    fileId: file.id,
    type: libraryFileType(file),
    source: fileSource(file),
    folderId: file.folder_id ?? null,
    searchText: libraryFileSearchText(file),
    createdAt: file.created_at || file.updated_at || null,
    productionAssociated: context.productionFileIds?.has(file.id),
    usedHere: context.usedFileIds?.has(file.id),
  }
}

export function libraryEntryMatchesQuery(entry: LibraryEntry, query: LibraryQuery, context: LibraryQueryContext = {}) {
  const productionAssociated = entry.productionAssociated ?? (entry.fileId !== undefined && context.productionFileIds?.has(entry.fileId)) ?? false
  const usedHere = entry.usedHere ?? (entry.fileId !== undefined && context.usedFileIds?.has(entry.fileId)) ?? false
  if (query.scope === "production" && !productionAssociated) return false
  if (query.scope === "folder" && (context.currentFolderId === undefined || entry.folderId !== context.currentFolderId)) return false
  if (query.folder !== "all" && entry.folderId !== (query.folder === "root" ? null : Number(query.folder))) return false
  if (query.type === "audio" && !["audio", "speech", "music", "sfx"].includes(entry.type)) return false
  if (query.type !== "all" && query.type !== "audio" && entry.type !== query.type) return false
  if (query.source !== "all" && entry.source !== query.source) return false
  if (query.usage === "used" && !usedHere) return false
  if (query.usage === "unused" && usedHere) return false
  const search = query.search.trim().toLocaleLowerCase()
  if (search && !entry.searchText.includes(search)) return false
  return true
}

function createdTime(value?: string | null) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function queryLibraryEntries<T extends { libraryEntry: LibraryEntry; order: number }>(items: readonly T[], query: LibraryQuery, context: LibraryQueryContext = {}) {
  return items.filter(({ libraryEntry }) => libraryEntryMatchesQuery(libraryEntry, query, context)).sort((left, right) => {
    if (query.sort === "name") return left.libraryEntry.searchText.localeCompare(right.libraryEntry.searchText)
    if (query.sort === "used") {
      const delta = Number(Boolean(right.libraryEntry.usedHere)) - Number(Boolean(left.libraryEntry.usedHere))
      if (delta) return delta
    }
    const recent = createdTime(right.libraryEntry.createdAt) - createdTime(left.libraryEntry.createdAt)
    if (recent) return recent
    if (left.libraryEntry.fileId !== undefined && right.libraryEntry.fileId !== undefined) {
      const idOrder = right.libraryEntry.fileId - left.libraryEntry.fileId
      if (idOrder) return idOrder
    }
    return left.order - right.order
  })
}

export function queryLibraryFiles(files: readonly WorkspaceFile[], query: LibraryQuery, context: LibraryQueryContext = {}) {
  return queryLibraryEntries(files.map((file, order) => ({ file, order, libraryEntry: libraryFileEntry(file, context) })), query, context).map(({ file }) => file)
}
