// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { originsApi } from "@/lib/api"
import type { WorkspaceOverview, WorkspaceSummary } from "@/types/domain"
import { WorkspaceExplorerPage } from "./workspace-explorer-page"

vi.mock("@/lib/api", () => ({ originsApi: {
  workspaces: vi.fn(), workspace: vi.fn(), creationActions: vi.fn(),
  createAudiovisualProject: vi.fn(), createFolder: vi.fn(),
  uploadFileSummary: vi.fn(),
} }))

const workspaces: WorkspaceSummary[] = [{
  id: 4, public_id: "workspace-4", name: "Campaign Lab", description: "Creative work",
  project_count: 1, file_count: 1, folder_count: 0,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
}]
const overview: WorkspaceOverview = {
  workspace: workspaces[0]!, folders: [],
  projects: [{ id: 8, public_id: "project-8", workspace_id: 4, folder_id: null, project_type: "audiovisual", name: "Launch film", description: "", status: "draft", updated_at: "2026-01-02T00:00:00Z", file_count: 1, part_count: 3 }],
  files: [{ id: 9, public_id: "file-9", workspace_id: 4, folder_id: null, name: "Score.wav", source: "generated", tags: ["music"], metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", current_version: { id: 10, public_id: "version-10", version: 1, filename: "score.wav", storage_key: "score.wav", url: "/audio/score.wav", size_bytes: 20, duration_ms: 5_000, mime_type: "audio/wav", family: "audio", width: null, height: null } }],
}

function renderPage(view: "create" | "projects" | "files" = "create") {
  return render(<MemoryRouter initialEntries={["/origins/"]}><TooltipProvider><Routes><Route path="/origins/*" element={<WorkspaceExplorerPage view={view} />} /></Routes></TooltipProvider></MemoryRouter>)
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(originsApi.workspaces).mockResolvedValue(workspaces)
  vi.mocked(originsApi.workspace).mockResolvedValue(overview)
  vi.mocked(originsApi.creationActions).mockResolvedValue([
    { id: "generate-speech", label: "Generate speech", description: "Turn text into speech.", output_mime_types: ["audio/wav"], supported_contexts: ["workspace"], composer: "speech" },
    { id: "generate-music", label: "Generate music", description: "Create a music File.", output_mime_types: ["audio/wav"], supported_contexts: ["workspace"], composer: "audio-generation" },
    { id: "generate-sound-effect", label: "Generate sound effect", description: "Create an SFX File.", output_mime_types: ["audio/wav"], supported_contexts: ["workspace"], composer: "audio-generation" },
  ])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("WorkspaceExplorerPage", () => {
  it("makes Create the entry while keeping Projects and Files visible", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "What do you want to create?" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Generate speech/ }).getAttribute("href")).toBe("/origins/create/generate-speech")
    expect(screen.getByRole("link", { name: /Generate music/ }).getAttribute("href")).toBe("/origins/create/generate-music")
    expect(screen.getByRole("link", { name: /Generate sound effect/ }).getAttribute("href")).toBe("/origins/create/generate-sound-effect")
    expect(screen.getByRole("link", { name: "Open Launch film" }).getAttribute("href")).toBe("/origins/projects/audiovisual/project-8")
    expect(screen.getByText("Score.wav")).toBeTruthy()
  })

  it("creates an audiovisual Project directly inside the selected Workspace", async () => {
    vi.mocked(originsApi.createAudiovisualProject).mockResolvedValue({ ...overview.projects[0]!, id: 11, public_id: "project-11", name: "New film" })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /New audiovisual project/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "New film" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }))
    await waitFor(() => expect(originsApi.createAudiovisualProject).toHaveBeenCalledWith(4, "New film", "", null))
  })

  it("uses dedicated Projects view without duplicating the Create stage", async () => {
    renderPage("projects")
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "What do you want to create?" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Files" })).toBeNull()
    expect(document.querySelector(".workspace-library-layout.has-single-column")).toBeTruthy()
  })

  it("lets the dedicated Files view use the complete library width", async () => {
    renderPage("files")
    expect(await screen.findByRole("heading", { name: "Files" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull()
    expect(document.querySelector(".workspace-library-layout.has-single-column")).toBeTruthy()
  })

  it("uploads a File directly into the selected Workspace and refreshes Files", async () => {
    vi.mocked(originsApi.uploadFileSummary).mockResolvedValue({
      id: 12, version_id: 13, name: "Brief", filename: "brief.pdf",
      family: "document", duration_ms: null, url: "/media/brief.pdf",
      category: null, tags: ["reference"], metadata: {}, media_format: "pdf",
      audio_format: null, sample_rate: null, channels: null, width: null,
      height: null, video_codec: null, frame_rate: null, size_bytes: 5,
      mime_type: "application/pdf", version_metadata: {},
      created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
    })
    renderPage("files")
    fireEvent.click(await screen.findByRole("button", { name: "Upload File" }))
    const dialog = screen.getByRole("dialog")
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(["%PDF"], "Brief.pdf", { type: "application/pdf" })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Tags optional, separated by commas" }), { target: { value: "Reference" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload File" }))
    await waitFor(() => expect(originsApi.uploadFileSummary).toHaveBeenCalledWith(4, file, {
      name: "Brief", tags: ["Reference"], folderId: null,
    }))
    await waitFor(() => expect(originsApi.workspace).toHaveBeenCalledTimes(2))
  })

  it("keeps the selected Folder through Create, Project creation and upload", async () => {
    vi.mocked(originsApi.workspace).mockResolvedValue({
      ...overview,
      folders: [{
        id: 21, public_id: "folder-21", workspace_id: 4,
        parent_id: null, name: "Episode 01", created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }],
    })
    vi.mocked(originsApi.createAudiovisualProject).mockResolvedValue({
      ...overview.projects[0]!, id: 11, public_id: "project-11",
      folder_id: 21, name: "Episode film",
    })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Episode 01" }))
    expect(screen.getByRole("link", { name: /Generate music/ }).getAttribute("href"))
      .toBe("/origins/create/generate-music?folder_id=21")
    fireEvent.click(screen.getByRole("button", { name: /New audiovisual project/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Episode film" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }))
    await waitFor(() => expect(originsApi.createAudiovisualProject)
      .toHaveBeenCalledWith(4, "Episode film", "", 21))
  })

  it("keeps the chosen File visible when upload fails", async () => {
    vi.mocked(originsApi.uploadFileSummary).mockRejectedValue(new Error("This File could not be decoded."))
    renderPage("files")
    fireEvent.click(await screen.findByRole("button", { name: "Upload File" }))
    const dialog = screen.getByRole("dialog")
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(["broken"], "Broken.pdf", { type: "application/pdf" })] } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload File" }))
    expect((await within(dialog).findByRole("alert")).textContent).toContain("This File could not be decoded.")
    expect(within(dialog).getByText("Broken.pdf")).toBeTruthy()
  })
})
