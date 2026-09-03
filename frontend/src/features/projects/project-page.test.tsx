// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { originsApi } from "@/lib/api"
import type { ProjectDetail, WorkspaceOverview } from "@/types/domain"
import { ProjectPage } from "./project-page"

vi.mock("@/lib/api", () => ({ originsApi: {
  project: vi.fn(), workspace: vi.fn(), updateProduction: vi.fn(),
} }))

const production = {
  id: 8, public_id: "production-8", workspace_id: 4, folder_id: null,
  project_id: null, production_type: "audiovisual", name: "Hero Film",
  description: "", status: "draft", updated_at: "2026-09-03T00:00:00Z",
  file_count: 1, part_count: 2,
}
const project: ProjectDetail = {
  id: 6, public_id: "project-6", workspace_id: 4, folder_id: null,
  name: "Nike Summer Launch", description: "Campaign initiative",
  production_count: 0, created_at: "2026-09-03T00:00:00Z",
  updated_at: "2026-09-03T00:00:00Z", productions: [],
}
const overview: WorkspaceOverview = {
  workspace: {
    id: 4, public_id: "workspace-4", name: "Campaign Lab", description: "",
    project_count: 1, production_count: 1, file_count: 0, folder_count: 0,
    created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z",
  },
  folders: [], projects: [project], productions: [production], files: [],
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/origins/projects/project-6"]}>
    <TooltipProvider><Routes><Route path="/origins/projects/:identifier" element={<ProjectPage />} /></Routes></TooltipProvider>
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
})
afterEach(cleanup)

describe("ProjectPage", () => {
  it("groups an existing Production and opens its existing workstation", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Nike Summer Launch" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add Production" }))
    fireEvent.click(screen.getByRole("button", { name: /Hero Film/ }))
    await waitFor(() => expect(originsApi.updateProduction).toHaveBeenCalledWith(8, { project_id: 6 }))

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
