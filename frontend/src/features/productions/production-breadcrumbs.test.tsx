// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import type { Production, WorkspaceFolder, WorkspaceProject } from "@/types/domain"
import { ProductionBreadcrumbs } from "./production-breadcrumbs"

const production = {
  id: 8,
  public_id: "production-8",
  workspace_id: 4,
  project_id: 6,
  folder_id: 21,
  production_type: "audiovisual",
  name: "Hero Film",
} as Production

const project: WorkspaceProject = {
  id: 6,
  public_id: "project-6",
  workspace_id: 4,
  name: "Nike Summer Launch",
  description: "",
  production_count: 1,
  created_at: "2026-09-03T00:00:00Z",
  updated_at: "2026-09-03T00:00:00Z",
}

const folders: WorkspaceFolder[] = [
  { id: 20, public_id: "folder-20", workspace_id: 4, project_id: 6, parent_id: null, name: "Drafts", created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z" },
  { id: 21, public_id: "folder-21", workspace_id: 4, project_id: 6, parent_id: 20, name: "Review", created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z" },
]

afterEach(cleanup)

describe("ProductionBreadcrumbs", () => {
  it("returns a grouped Production to its exact Project Folder context", () => {
    render(<MemoryRouter><ProductionBreadcrumbs production={production} project={project} folders={folders} /></MemoryRouter>)

    expect(screen.getByRole("link", { name: project.name }).getAttribute("href"))
      .toBe("/origins/projects/project-6?folder=folder-21")
    expect(screen.getByRole("link", { name: "Drafts" }).getAttribute("href"))
      .toBe("/origins/projects/project-6?folder=folder-20")
    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href"))
      .toBe("/origins/projects/project-6?folder=folder-21")
    expect(screen.getByText("Hero Film").getAttribute("aria-current")).toBe("page")
  })

  it("keeps standalone Production navigation unchanged", () => {
    render(<MemoryRouter><ProductionBreadcrumbs production={{ ...production, project_id: null, folder_id: null }} project={null} folders={folders} /></MemoryRouter>)

    expect(screen.getByRole("link", { name: "Productions" }).getAttribute("href"))
      .toBe("/origins/productions")
    expect(screen.queryByRole("link", { name: project.name })).toBeNull()
  })

  it.each([
    ["Workspace", { workspace_id: 99 }],
    ["Project", { project_id: 99 }],
  ])("rejects a Folder path outside the Production %s context", (_boundary, mismatch) => {
    render(<MemoryRouter><ProductionBreadcrumbs
      production={production}
      project={project}
      folders={folders.map((folder) => ({ ...folder, ...mismatch }))}
    /></MemoryRouter>)

    expect(screen.getByRole("link", { name: project.name }).getAttribute("href"))
      .toBe("/origins/projects/project-6")
    expect(screen.queryByRole("link", { name: "Drafts" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull()
  })

  it("keeps the grouped Production usable when its Project summary is unavailable", () => {
    render(<MemoryRouter><ProductionBreadcrumbs production={production} project={null} folders={folders} /></MemoryRouter>)

    expect(screen.getByRole("link", { name: "Project" }).getAttribute("href"))
      .toBe("/origins/projects/6?folder=folder-21")
    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href"))
      .toBe("/origins/projects/6?folder=folder-21")
    expect(screen.getByText("Hero Film").getAttribute("aria-current")).toBe("page")
  })
})
