// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { studioApi } from "@/lib/api"
import type { SpaceOverview, SpaceSummary } from "@/types/domain"
import { SpaceHomePage } from "./space-home-page"

vi.mock("@/lib/api", () => ({ studioApi: {
  spaces: vi.fn(), space: vi.fn(), creationActions: vi.fn(),
  createAudiovisualProject: vi.fn(), createFolder: vi.fn(),
} }))

const spaces: SpaceSummary[] = [{
  id: 4, public_id: "space-4", name: "Sandbox", description: "Creative work",
  project_count: 1, file_count: 1, folder_count: 0,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
}]
const overview: SpaceOverview = {
  space: spaces[0]!, folders: [],
  projects: [{ id: 8, public_id: "project-8", space_id: 4, folder_id: null, project_type: "audiovisual", name: "Launch film", description: "", status: "draft", updated_at: "2026-01-02T00:00:00Z", file_count: 1, part_count: 3 }],
  files: [{ id: 9, public_id: "file-9", space_id: 4, folder_id: null, name: "Score.wav", source: "generated", tags: ["music"], metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", current_version: { id: 10, public_id: "version-10", version: 1, filename: "score.wav", storage_key: "score.wav", url: "/audio/score.wav", size_bytes: 20, duration_ms: 5_000, mime_type: "audio/wav", family: "audio", width: null, height: null } }],
}

function renderPage(view: "create" | "projects" | "files" = "create") {
  return render(<MemoryRouter initialEntries={["/audio-studio/"]}><TooltipProvider><Routes><Route path="/audio-studio/*" element={<SpaceHomePage view={view} />} /></Routes></TooltipProvider></MemoryRouter>)
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(studioApi.spaces).mockResolvedValue(spaces)
  vi.mocked(studioApi.space).mockResolvedValue(overview)
  vi.mocked(studioApi.creationActions).mockResolvedValue([{ id: "generate-speech", label: "Generate speech", description: "Turn text into speech.", output_mime_types: ["audio/wav"], supported_contexts: ["space"], composer: "speech" }])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("SpaceHomePage", () => {
  it("makes Create the entry while keeping Projects and Files visible", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "What do you want to create?" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Generate speech/ }).getAttribute("href")).toBe("/audio-studio/speak")
    expect(screen.getByRole("link", { name: "Open Launch film" }).getAttribute("href")).toBe("/audio-studio/projects/audiovisual/project-8")
    expect(screen.getByText("Score.wav")).toBeTruthy()
  })

  it("creates an audiovisual Project directly inside the selected Space", async () => {
    vi.mocked(studioApi.createAudiovisualProject).mockResolvedValue({ ...overview.projects[0]!, id: 11, public_id: "project-11", name: "New film" })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /New audiovisual project/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "New film" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }))
    await waitFor(() => expect(studioApi.createAudiovisualProject).toHaveBeenCalledWith(4, "New film", ""))
  })

  it("uses dedicated Projects view without duplicating the Create stage", async () => {
    renderPage("projects")
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "What do you want to create?" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Files" })).toBeNull()
    expect(document.querySelector(".space-library-layout.has-single-column")).toBeTruthy()
  })

  it("lets the dedicated Files view use the complete library width", async () => {
    renderPage("files")
    expect(await screen.findByRole("heading", { name: "Files" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull()
    expect(document.querySelector(".space-library-layout.has-single-column")).toBeTruthy()
  })
})
