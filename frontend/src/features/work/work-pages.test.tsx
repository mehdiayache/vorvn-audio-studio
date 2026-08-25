// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProjectPage } from "./project-page"
import { SeriesPage } from "./series-page"
import type { ProjectOverview, SeriesOverview, WorkResource } from "@/types/domain"

afterEach(cleanup)

vi.mock("@/hooks/use-voice-directory", () => ({
  useVoiceDirectory: () => ({
    directory: { identities: [] },
    loading: false,
    error: "",
  }),
}))

vi.mock("@/components/global-player-provider", () => ({
  useGlobalPlayer: () => ({ source: null, state: "idle", toggleSource: vi.fn() }),
}))

function renderPage(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

const projectResource: WorkResource = { public_id: "project-3", key: "project:3", id: 3, type: "project", name: "Sleeping guides", description: "Sleep audio", icon: "/icon/sleeping.jpg", cover_image: "/icon/sleeping.jpg" }
const metrics = { series_count: 1, standalone_count: 1, production_count: 2, part_count: 7, duration_ms: 90000, total_cost: .12, current_sequence_cost: .12 }
const production = { id: 6, public_id: "prd_falling", key: "production:6", type: "production" as const, name: "Falling asleep", description: "A finished episode", status: "draft", series_id: 1, part_count: 7, duration_ms: 90000, total_cost: .12, current_sequence_cost: .12 }

describe("canonical work pages", () => {
  it("puts direct Productions before Series in a Project", () => {
    const data: ProjectOverview = {
      resource: projectResource,
      trail: [{ id: 2, public_id: "vnt_heartsnotes", type: "venture", name: "Heartsnotes" }],
      metrics,
      series: [{ id: 1, public_id: "ser_prayer", key: "series:1", type: "series", icon: "", name: "Christian prayer", description: "Recurring line", defaults: {}, metrics: { production_count: 1, part_count: 7, duration_ms: 90000, total_cost: .12, current_sequence_cost: .12 }, productions: [production] }],
      standalone_productions: [{ ...production, id: 7, public_id: "prd_scratch", name: "Scratch", series_id: null }],
    }
    renderPage(<ProjectPage data={data} refresh={() => undefined} />)
    expect(screen.getByText("Series")).toBeTruthy()
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent)
    expect(headings.indexOf("Productions")).toBeLessThan(headings.indexOf("Series"))
    expect(screen.queryByText("Inside this Project")).toBeNull()
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Project settings for Sleeping guides/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open Series Christian prayer" }).getAttribute("href")).toBe("/audio-studio/series/ser_prayer")
    expect(screen.getByRole("link", { name: /Scratch/ }).getAttribute("href")).toBe("/audio-studio/productions/prd_scratch")
  })

  it("presents a Series as a catalog and sends audio work to Productions", () => {
    const data: SeriesOverview = {
      resource: { ...projectResource, public_id: "series-1", key: "series:1", id: 1, type: "series", project_id: 3, name: "Christian prayer" },
      trail: [{ id: 2, public_id: "vnt_heartsnotes", type: "venture", name: "Heartsnotes" }, { id: 3, public_id: "prj_sleeping", type: "project", name: "Sleeping guides" }],
      defaults: { language: "Arabic" }, metrics, productions: [production],
    }
    renderPage(<SeriesPage data={data} refresh={() => undefined} />)
    expect(screen.getByRole("heading", { name: "Productions" })).toBeTruthy()
    expect(screen.getByText("Arabic")).toBeTruthy()
    expect(screen.queryByText("Timeline")).toBeNull()
    expect(screen.queryByText("Reading mode")).toBeNull()
    expect(screen.getByRole("link", { name: /Falling asleep/ }).getAttribute("href")).toBe("/audio-studio/productions/prd_falling")
  })
})
