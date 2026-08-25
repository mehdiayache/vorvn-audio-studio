// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router-dom"

import type { ProjectSummary } from "@/types/domain"
import { ProjectCard } from "./project-card"

afterEach(cleanup)

function renderCard(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

const project: ProjectSummary = {
  id: 3,
  public_id: "prj_sleeping",
  key: "project:3",
  type: "project",
  name: "Sleeping guides with a deliberately long name",
  description: "Calm evening productions.",
  cover_image: "/icon/sleeping.jpg",
  metrics: { production_count: 3, part_count: 12, duration_ms: 88000, total_cost: .02, current_sequence_cost: .02 },
  updated_at: "2026-08-07T03:31:12.852306+00:00",
}

describe("ProjectCard", () => {
  it("keeps navigation, identity and settings as separate controls", () => {
    renderCard(<ProjectCard project={project} onUpdated={() => undefined} />)
    expect(screen.getByRole("link", { name: /Open Project Sleeping guides/ }).getAttribute("href")).toBe("/audio-studio/projects/prj_sleeping")
    expect(screen.getByRole("heading", { name: project.name })).toBeTruthy()
    expect(screen.queryByText("Project")).toBeNull()
    expect(screen.getByText("3 productions")).toBeTruthy()
    expect(screen.getByText("1:28")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Project settings for Sleeping guides/ })).toBeTruthy()
  })

  it("opens Project-specific settings without navigating", async () => {
    renderCard(<ProjectCard project={project} venture={{ id: 2, public_id: "vnt_heartsnotes", type: "venture", name: "Heartsnotes", icon: "💜" }} onUpdated={() => undefined} />)
    fireEvent.pointerDown(screen.getByRole("button", { name: /Project settings for Sleeping guides/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Project settings" }))
    expect(screen.getByRole("dialog", { name: "Project settings" })).toBeTruthy()
    expect(screen.getByRole("img", { name: "Project cover preview" }).getAttribute("src")).toBe(project.cover_image)
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveProperty("value", project.name)
    expect(screen.getByText("This Project lives inside this Venture.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open Venture Heartsnotes" }).getAttribute("href")).toBe("/audio-studio/ventures/vnt_heartsnotes")
  })
})
