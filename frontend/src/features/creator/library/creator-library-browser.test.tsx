// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { WorkspaceFile } from "@/types/domain"
import { CreatorLibraryBrowser, creatorLibraryKind } from "./creator-library-browser"

const files: WorkspaceFile[] = [
  { id: 1, name: "Narration", media_type: "audio", category: "speech", filename: "speech.wav", tags: [] },
  { id: 2, name: "Opening score", media_type: "audio", category: "music", filename: "music.wav", tags: [] },
  { id: 3, name: "Door slam", media_type: "audio", category: "sfx", filename: "door.wav", tags: [] },
  { id: 4, name: "Portrait", media_type: "image", filename: "portrait.png", tags: [] },
  { id: 5, name: "English captions", media_type: "audio", filename: "english.srt", mime_type: "application/x-subrip", tags: [] },
]

afterEach(cleanup)

describe("CreatorLibraryBrowser", () => {
  it("keeps Speech as a human audio kind while preserving technical format separately", () => {
    expect(creatorLibraryKind(files[0]!)).toBe("speech")
    expect(creatorLibraryKind(files[4]!)).toBe("subtitle")
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
  })
})
