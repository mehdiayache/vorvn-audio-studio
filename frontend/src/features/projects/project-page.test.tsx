// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { originsApi } from "@/lib/api"
import type { ProjectDetail, WorkspaceOverview } from "@/types/domain"
import { ProjectPage } from "./project-page"

vi.mock("@/lib/api", () => ({ originsApi: {
  project: vi.fn(), workspace: vi.fn(), updateProduction: vi.fn(),
  createFolder: vi.fn(), createAudiovisualProduction: vi.fn(),
} }))

const production = {
  id: 8, public_id: "production-8", workspace_id: 4, folder_id: null,
  project_id: null, production_type: "audiovisual", name: "Hero Film",
  description: "", status: "draft", updated_at: "2026-09-03T00:00:00Z",
  file_count: 1, part_count: 2,
}
const project: ProjectDetail = {
  id: 6, public_id: "project-6", workspace_id: 4,
  name: "Nike Summer Launch", description: "Campaign initiative",
  production_count: 0, created_at: "2026-09-03T00:00:00Z",
  updated_at: "2026-09-03T00:00:00Z", folders: [], productions: [], files: [],
}
const overview: WorkspaceOverview = {
  workspace: {
    id: 4, public_id: "workspace-4", name: "Campaign Lab", description: "",
    project_count: 1, production_count: 1, file_count: 0, folder_count: 0,
    created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z",
  },
  folders: [], projects: [project], productions: [production], files: [],
}

function LocationControls() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output aria-label="Current route">{location.pathname}{location.search}</output><button type="button" onClick={() => navigate(-1)}>Browser Back</button><button type="button" onClick={() => navigate(1)}>Browser Forward</button></>
}

function renderPage(entry = "/origins/projects/project-6") {
  return render(<MemoryRouter initialEntries={[entry]}>
    <TooltipProvider><LocationControls /><Routes><Route path="/origins/projects/:identifier" element={<ProjectPage />} /><Route path="/origins/productions/audiovisual/:identifier" element={<div>Workstation</div>} /></Routes></TooltipProvider>
  </MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(originsApi.project).mockResolvedValue(project)
  vi.mocked(originsApi.workspace).mockResolvedValue(overview)
  vi.mocked(originsApi.updateProduction).mockResolvedValue({
    ...production, project_id: project.id, settings: {}, parts: [], exports: [],
    total_cost: 0, current_sequence_cost: 0, total_bytes: 0, accounting: {
      historical_spend: 0, current_sequence_cost: 0,
    },
  } as unknown as Awaited<ReturnType<typeof originsApi.updateProduction>>)
  vi.mocked(originsApi.createFolder).mockResolvedValue({
    id: 12, public_id: "folder-12", workspace_id: 4, project_id: 6,
    parent_id: null, name: "References", created_at: "2026-09-03T00:00:00Z",
    updated_at: "2026-09-03T00:00:00Z",
  })
  vi.mocked(originsApi.createAudiovisualProduction).mockResolvedValue({
    ...production, id: 13, public_id: "production-13", project_id: 6,
    name: "Campaign Film",
  })
})
afterEach(cleanup)

describe("ProjectPage", () => {
  it("groups an existing Production and opens its existing workstation", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Nike Summer Launch" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add existing" }))
    fireEvent.click(await screen.findByRole("button", { name: /Hero Film/ }))
    await waitFor(() => expect(originsApi.updateProduction).toHaveBeenCalledWith(8, {
      project_id: 6, folder_id: null,
    }))

    vi.mocked(originsApi.project).mockResolvedValue({
      ...project, production_count: 1, productions: [{
        id: production.id, public_id: production.public_id,
        workspace_id: production.workspace_id, folder_id: production.folder_id,
        project_id: 6, production_type: production.production_type,
        name: production.name, description: production.description,
        status: production.status, updated_at: production.updated_at,
      }],
    })
    await waitFor(() => expect(originsApi.project).toHaveBeenCalledTimes(2))
  })

  it("adds an existing Production into the active Project Folder without recreating it", async () => {
    const folder = {
      id: 20, public_id: "folder-20", workspace_id: 4, project_id: 6,
      parent_id: null, name: "Drafts", created_at: "2026-09-03T00:00:00Z",
      updated_at: "2026-09-03T00:00:00Z",
    }
    vi.mocked(originsApi.project).mockResolvedValue({ ...project, folders: [folder] })
    renderPage("/origins/projects/project-6?folder=folder-20")

    await screen.findByRole("button", { name: "Drafts", current: "page" })
    fireEvent.click(screen.getByRole("button", { name: "Add existing" }))
    fireEvent.click(await screen.findByRole("button", { name: /Hero Film/ }))

    await waitFor(() => expect(originsApi.updateProduction).toHaveBeenCalledWith(8, {
      project_id: 6, folder_id: 20,
    }))
    expect(originsApi.createAudiovisualProduction).not.toHaveBeenCalled()
  })

  it("addresses nested Project Folders and follows browser history", async () => {
    const folders = [
      { id: 20, public_id: "folder-20", workspace_id: 4, project_id: 6, parent_id: null, name: "Drafts", created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z" },
      { id: 21, public_id: "folder-21", workspace_id: 4, project_id: 6, parent_id: 20, name: "Review", created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z" },
    ]
    vi.mocked(originsApi.project).mockResolvedValue({ ...project, folders })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Drafts" }))
    expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6?folder=folder-20")
    fireEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6?folder=folder-21")
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }))
    await waitFor(() => expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6?folder=folder-20"))
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }))
    await waitFor(() => expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6"))
    fireEvent.click(screen.getByRole("button", { name: "Browser Forward" }))
    await waitFor(() => expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6?folder=folder-20"))
  })

  it("returns invalid Project Folder deep links to the Project root", async () => {
    vi.mocked(originsApi.project).mockResolvedValue({
      ...project,
      folders: [{
        id: 20, public_id: "foreign-folder", workspace_id: 4, project_id: 99,
        parent_id: null, name: "Foreign", created_at: "2026-09-03T00:00:00Z",
        updated_at: "2026-09-03T00:00:00Z",
      }],
    })
    renderPage("/origins/projects/project-6?folder=foreign-folder")

    await screen.findByRole("heading", { name: project.name })
    await waitFor(() => expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6"))
    expect(screen.queryByText("Foreign")).toBeNull()
  })

  it("creates a Folder directly in the Project context", async () => {
    renderPage()
    await screen.findByRole("heading", { name: "Nike Summer Launch" })
    fireEvent.click(screen.getByRole("button", { name: "New Folder" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "References" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }))
    await waitFor(() => expect(originsApi.createFolder)
      .toHaveBeenCalledWith(4, "References", null, 6))
  })

  it("creates a Production directly in the Project and opens its workstation", async () => {
    renderPage()
    await screen.findByRole("heading", { name: "Nike Summer Launch" })
    fireEvent.click(screen.getByRole("button", { name: "New Production" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Campaign Film" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Production" }))
    await waitFor(() => expect(originsApi.createAudiovisualProduction)
      .toHaveBeenCalledWith(4, "Campaign Film", "", null, 6))
  })

  it("preserves nested Project Folder context for new work", async () => {
    const folder = {
      id: 20, public_id: "folder-20", workspace_id: 4, project_id: 6,
      parent_id: null, name: "References", created_at: "2026-09-03T00:00:00Z",
      updated_at: "2026-09-03T00:00:00Z",
    }
    vi.mocked(originsApi.project).mockResolvedValue({ ...project, folders: [folder] })
    vi.mocked(originsApi.createFolder).mockResolvedValue({
      ...folder, id: 21, public_id: "folder-21", parent_id: folder.id,
      name: "Research",
    })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "References" }))
    fireEvent.click(screen.getByRole("button", { name: "New Folder" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Research" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }))
    await waitFor(() => expect(originsApi.createFolder)
      .toHaveBeenCalledWith(4, "Research", 20, 6))
    await waitFor(() => expect(screen.getByLabelText("Current route").textContent)
      .toBe("/origins/projects/project-6?folder=folder-21"))

    fireEvent.click(screen.getByRole("button", { name: "New Production" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Campaign Film" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Production" }))
    await waitFor(() => expect(originsApi.createAudiovisualProduction)
      .toHaveBeenCalledWith(4, "Campaign Film", "", 21, 6))
  })

  it("keeps Production navigation on the canonical audiovisual route", async () => {
    vi.mocked(originsApi.project).mockResolvedValue({
      ...project, production_count: 1, productions: [{
        id: production.id, public_id: production.public_id,
        workspace_id: production.workspace_id, folder_id: production.folder_id,
        project_id: 6, production_type: production.production_type,
        name: production.name, description: production.description,
        status: production.status, updated_at: production.updated_at,
      }],
    })
    renderPage()
    const link = await screen.findByRole("link", { name: "Open Production Hero Film" })
    expect(link.getAttribute("href")).toBe("/origins/productions/audiovisual/production-8")
  })
})
