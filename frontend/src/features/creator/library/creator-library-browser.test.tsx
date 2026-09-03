// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { WorkspaceFile } from "@/types/domain"
import { libraryFileType } from "@/features/library/library-query"
import { CreatorLibraryBrowser } from "./creator-library-browser"

const files: WorkspaceFile[] = [
  { id: 1, name: "Narration", media_type: "audio", source: "generated", category: "speech", filename: "speech.wav", tags: [] },
  { id: 2, name: "Opening score", media_type: "audio", source: "generated", category: "music", filename: "music.wav", tags: [] },
  { id: 3, name: "Door slam", media_type: "audio", source: "freesound", category: "sfx", filename: "door.wav", tags: [] },
  { id: 4, name: "Portrait", media_type: "image", source: "uploaded", filename: "portrait.png", tags: [] },
  { id: 5, name: "English captions", media_type: "audio", source: "uploaded", filename: "english.srt", mime_type: "application/x-subrip", tags: [] },
  { id: 6, name: "Uploaded interview", media_type: "audio", source: "uploaded", filename: "interview.wav", tags: [] },
]

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()

describe("CreatorLibraryBrowser", () => {
  it("keeps Speech as a human audio kind while preserving technical format separately", () => {
    expect(libraryFileType(files[0]!)).toBe("speech")
    expect(libraryFileType(files[4]!)).toBe("subtitle")
    expect(libraryFileType(files[5]!)).toBe("audio")
  })

  it("offers one reusable human filter grammar across creation capabilities", () => {
    render(<CreatorLibraryBrowser files={files} initialKind="speech" onPlay={vi.fn()} />)
    expect(screen.getByText("Narration")).toBeTruthy()
    expect(screen.queryByText("Opening score")).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "Music" }))
    expect(screen.getByText("Opening score")).toBeTruthy()
    expect(screen.queryByText("Narration")).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "Subtitles" }))
    expect(screen.getByText("English captions")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Audio" }))
    expect(screen.getByText("Uploaded interview")).toBeTruthy()
    expect(screen.getByText("Narration")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Sound Effect" }))
    expect(screen.getByText("Door slam")).toBeTruthy()
  })

  it("shows a capability Job in Library immediately without inventing a File", () => {
    render(<CreatorLibraryBrowser files={files} initialKind="speech" creationItems={[{
      id: "job-1",
      mediaType: "speech",
      status: "generating",
      node: <article>Generating speech now</article>,
    }]} />)
    expect(screen.getByText("Generating speech now")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Music" }))
    expect(screen.queryByText("Generating speech now")).toBeNull()
  })

  it("uses the same provenance semantics as every other Library presentation", async () => {
    render(<CreatorLibraryBrowser files={files} initialKind="all" onPlay={vi.fn()} />)
    fireEvent.click(screen.getByRole("combobox", { name: "File source" }))
    fireEvent.click(await screen.findByRole("option", { name: "Imported" }))
    expect(screen.getByText("Door slam")).toBeTruthy()
    expect(screen.queryByText("Portrait")).toBeNull()
  })

  it("applies the same search, folder and type query to in-flight creation items", async () => {
    render(<CreatorLibraryBrowser
      folders={[{ id: 7, public_id: "campaign", workspace_id: 1, parent_id: null, name: "Campaign", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]}
      files={[]}
      creationItems={[
        { id: "speech", status: "generating", mediaType: "speech", folderId: 7, searchText: "Warm narrator", node: <div>Speech operation</div> },
        { id: "image", status: "generating", mediaType: "image", folderId: null, searchText: "Harbor still", node: <div>Image operation</div> },
      ]}
    />)
    fireEvent.click(screen.getByRole("combobox", { name: "Library folder" }))
    fireEvent.click(await screen.findByRole("option", { name: "Campaign" }))
    fireEvent.click(screen.getByRole("radio", { name: "Audio" }))
    expect(screen.getByText("Speech operation")).toBeTruthy()
    expect(screen.queryByText("Image operation")).toBeNull()
    fireEvent.change(screen.getByRole("textbox", { name: "Search Library" }), { target: { value: "harbor" } })
    expect(screen.queryByText("Speech operation")).toBeNull()
  })
})
