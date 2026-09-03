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
  createProject: vi.fn(), createAudiovisualProduction: vi.fn(), createFolder: vi.fn(),
  uploadFileSummary: vi.fn(),
} }))

const workspaces: WorkspaceSummary[] = [{
  id: 4, public_id: "workspace-4", name: "Campaign Lab", description: "Creative work",
  project_count: 0, production_count: 1, file_count: 1, folder_count: 0,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
}]
const overview: WorkspaceOverview = {
  workspace: { ...workspaces[0]!, project_count: 1 }, folders: [], projects: [{
    id: 7, public_id: "project-7", workspace_id: 4, folder_id: null,
    name: "Summer Launch", description: "Campaign", production_count: 1,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
  }],
  productions: [{ id: 8, public_id: "production-8", workspace_id: 4, folder_id: null, project_id: null, production_type: "audiovisual", name: "Launch film", description: "", status: "draft", updated_at: "2026-01-02T00:00:00Z", file_count: 1, part_count: 3 }],
  files: [{ id: 9, public_id: "file-9", workspace_id: 4, folder_id: null, name: "Score.wav", source: "generated", tags: ["music"], metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", current_version: { id: 10, public_id: "version-10", version: 1, filename: "score.wav", storage_key: "score.wav", url: "/audio/score.wav", size_bytes: 20, duration_ms: 5_000, mime_type: "audio/wav", family: "audio", width: null, height: null } }],
}

function renderPage(view: "home" | "projects" | "productions" | "files" | "explorer" = "home") {
  return render(<MemoryRouter initialEntries={["/origins/"]}><TooltipProvider><Routes><Route path="/origins/*" element={<WorkspaceExplorerPage view={view} />} /></Routes></TooltipProvider></MemoryRouter>)
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(originsApi.workspaces).mockResolvedValue(workspaces)
  vi.mocked(originsApi.workspace).mockResolvedValue(overview)
  vi.mocked(originsApi.creationActions).mockResolvedValue([
    { id: "generate-speech", label: "Generate speech", description: "Turn text into speech.", output_mime_types: ["audio/wav"], supported_contexts: ["workspace"], capability_id: "speech.generate" },
    { id: "generate-music", label: "Generate music", description: "Create a music File.", output_mime_types: ["audio/wav"], supported_contexts: ["workspace"], capability_id: "music.generate" },
    { id: "generate-sound-effect", label: "Generate sound effect", description: "Create an SFX File.", output_mime_types: ["audio/wav"], supported_contexts: ["workspace"], capability_id: "sfx.generate" },
    { id: "generate-image", label: "Generate image", description: "Create an image.", output_mime_types: ["image/png"], supported_contexts: ["workspace"], capability_id: "image.generate" },
    { id: "generate-video", label: "Generate video", description: "Create a video.", output_mime_types: ["video/mp4"], supported_contexts: ["workspace"], capability_id: "video.generate" },
  ])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
Element.prototype.scrollIntoView = vi.fn()

describe("WorkspaceExplorerPage", () => {
  it("makes Home teach Projects, Production types and standalone Creator capabilities", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Campaign Lab" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "What do you want to create today?" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "New Project" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Audiovisual/ })).toBeTruthy()
    expect(screen.getByRole("article", { name: "Merch, coming soon" })).toBeTruthy()
    expect(screen.getByRole("article", { name: "Slides, coming soon" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Speech/ }).getAttribute("href")).toBe("/origins/create/generate-speech")
    expect(screen.getByRole("link", { name: /Music/ }).getAttribute("href")).toBe("/origins/create/generate-music")
    expect(screen.getByRole("link", { name: /Sound Effect/ }).getAttribute("href")).toBe("/origins/create/generate-sound-effect")
    expect(screen.getByRole("link", { name: /Image/ }).getAttribute("href")).toBe("/origins/create/generate-image")
    expect(screen.getByRole("link", { name: /Video/ }).getAttribute("href")).toBe("/origins/create/generate-video")
    expect(screen.queryByText("Subtitles")).toBeNull()
    expect(screen.getByRole("link", { name: "Open Project Summer Launch" }).getAttribute("href")).toBe("/origins/projects/project-7")
    expect(screen.getByRole("link", { name: "Open Launch film" }).getAttribute("href")).toBe("/origins/productions/audiovisual/production-8")
  })

  it("creates an audiovisual Production directly inside the selected Workspace", async () => {
    vi.mocked(originsApi.createAudiovisualProduction).mockResolvedValue({ ...overview.productions[0]!, id: 11, public_id: "production-11", name: "New film" })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: /Audiovisual/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "New film" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Production" }))
    await waitFor(() => expect(originsApi.createAudiovisualProduction).toHaveBeenCalledWith(4, "New film", "", null))
  })

  it("uses dedicated Productions view without duplicating Home", async () => {
    renderPage("productions")
    expect(await screen.findByRole("heading", { name: "Productions" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "What do you want to create today?" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Files" })).toBeNull()
    expect(document.querySelector(".workspace-library-layout.has-single-column")).toBeTruthy()
  })

  it("creates a Project as a grouping resource in the selected Workspace", async () => {
    vi.mocked(originsApi.createProject).mockResolvedValue({
      id: 12, public_id: "project-12", workspace_id: 4, folder_id: null,
      name: "Nike Summer Launch", description: "Campaign", production_count: 0,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    })
    renderPage("projects")
    fireEvent.click(await screen.findByRole("button", { name: "New Project" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Nike Summer Launch" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }))
    await waitFor(() => expect(originsApi.createProject).toHaveBeenCalledWith(4, "Nike Summer Launch", "", null))
  })

  it("lets the dedicated Files view use the complete library width", async () => {
    renderPage("files")
    expect(await screen.findByRole("heading", { name: "Files" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Productions" })).toBeNull()
    expect(document.querySelector(".workspace-library-layout.has-single-column")).toBeTruthy()
  })

  it("searches and filters Workspace Files with the universal Library semantics", async () => {
    vi.mocked(originsApi.workspace).mockResolvedValue({
      ...overview,
      files: [
        { id: 30, public_id: "file-30", workspace_id: 4, name: "Campaign narration", media_type: "audio", source: "generated", category: "speech", tags: ["launch"] },
        { id: 31, public_id: "file-31", workspace_id: 4, name: "Campaign brief", media_type: "document", source: "uploaded", tags: ["launch"] },
      ],
    })
    renderPage("files")
    expect(await screen.findByText("Campaign narration")).toBeTruthy()
    expect(screen.getByText("Campaign brief")).toBeTruthy()

    fireEvent.click(screen.getByRole("combobox", { name: "File type" }))
    fireEvent.click(await screen.findByRole("option", { name: "Speech" }))
    expect(screen.getByText("Campaign narration")).toBeTruthy()
    expect(screen.queryByText("Campaign brief")).toBeNull()

    fireEvent.click(screen.getByRole("combobox", { name: "File source" }))
    fireEvent.click(await screen.findByRole("option", { name: "Uploaded" }))
    expect(screen.queryByText("Campaign narration")).toBeNull()
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

  it("keeps the selected Folder through Production creation", async () => {
    vi.mocked(originsApi.workspace).mockResolvedValue({
      ...overview,
      folders: [{
        id: 21, public_id: "folder-21", workspace_id: 4,
        parent_id: null, name: "Episode 01", created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }],
    })
    vi.mocked(originsApi.createAudiovisualProduction).mockResolvedValue({
      ...overview.productions[0]!, id: 11, public_id: "production-11",
      folder_id: 21, name: "Episode film",
    })
    renderPage("productions")
    fireEvent.click(await screen.findByRole("button", { name: "Episode 01" }))
    fireEvent.click(screen.getByRole("button", { name: "New Production" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Episode film" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Production" }))
    await waitFor(() => expect(originsApi.createAudiovisualProduction)
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
