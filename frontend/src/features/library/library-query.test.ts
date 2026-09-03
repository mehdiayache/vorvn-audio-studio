import { describe, expect, it } from "vitest"

import type { WorkspaceFile } from "@/types/domain"
import { createLibraryQuery, libraryFileType, queryLibraryFiles } from "./library-query"

const files: WorkspaceFile[] = [
  { id: 1, name: "Hero image", media_type: "image", source: "generated", folder_id: 10, tags: ["launch"], created_at: "2026-01-04T00:00:00Z" },
  { id: 2, name: "Narration", media_type: "audio", source: "generated", category: "speech", folder_id: 10, tags: ["voice"], created_at: "2026-01-03T00:00:00Z" },
  { id: 3, name: "Theme", media_type: "audio", source: "uploaded", category: "music", folder_id: null, tags: ["launch"], created_at: "2026-01-02T00:00:00Z" },
  { id: 4, name: "Impact", media_type: "audio", source: "freesound", category: "sfx", folder_id: 20, tags: [], created_at: "2026-01-01T00:00:00Z" },
  { id: 5, name: "Transcript", media_type: "subtitle", source: "uploaded", folder_id: 10, tags: [] },
  { id: 6, name: "Brief", media_type: "document", source: "uploaded", folder_id: null, tags: [] },
  { id: 7, name: "Dataset", media_type: "data", source: "uploaded", folder_id: null, tags: [] },
]

describe("LibraryQuery", () => {
  it("classifies every canonical visible File type in one place", () => {
    expect(files.map(libraryFileType)).toEqual(["image", "speech", "music", "sfx", "subtitle", "document", "data"])
  })

  it("filters Workspace Files with the canonical search, type, source and folder semantics", () => {
    expect(queryLibraryFiles(files, createLibraryQuery({ search: "launch", source: "generated", type: "image", folder: "10" })).map(({ id }) => id)).toEqual([1])
    expect(queryLibraryFiles(files, createLibraryQuery({ source: "imported" })).map(({ id }) => id)).toEqual([4])
    expect(queryLibraryFiles(files, createLibraryQuery({ type: "audio" })).map(({ id }) => id)).toEqual([2, 3, 4])
  })

  it("distinguishes Production association, current Folder and Workspace scopes", () => {
    const context = { productionFileIds: new Set([1, 3]), currentFolderId: 10 }
    expect(queryLibraryFiles(files, createLibraryQuery({ scope: "production" }), context).map(({ id }) => id)).toEqual([1, 3])
    expect(queryLibraryFiles(files, createLibraryQuery({ scope: "folder" }), context).map(({ id }) => id)).toEqual([1, 2, 5])
    expect(queryLibraryFiles(files, createLibraryQuery({ scope: "workspace" }), context)).toHaveLength(files.length)
  })

  it("uses actual Production usage independently from Production association", () => {
    const context = { productionFileIds: new Set([1, 2, 3]), usedFileIds: new Set([2]) }
    expect(queryLibraryFiles(files, createLibraryQuery({ scope: "production", usage: "used" }), context).map(({ id }) => id)).toEqual([2])
    expect(queryLibraryFiles(files, createLibraryQuery({ scope: "production", usage: "unused" }), context).map(({ id }) => id)).toEqual([1, 3])
  })
})
