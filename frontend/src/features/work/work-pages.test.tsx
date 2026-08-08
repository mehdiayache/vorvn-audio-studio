// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ProjectPage } from "./project-page"
import { SeriesPage } from "./series-page"
import type { ProjectOverview, SeriesOverview, WorkResource } from "@/types/domain"

afterEach(cleanup)

const projectResource: WorkResource = { public_id: "project-3", key: "project:3", id: 3, type: "project", name: "Sleeping guides", description: "Sleep audio", icon: "/icon/sleeping.jpg", cover_image: "/icon/sleeping.jpg" }
const metrics = { series_count: 1, production_count: 2, part_count: 7, duration_ms: 90000, total_cost: .12 }
const production = { id: 6, name: "Falling asleep", description: "A finished episode", status: "draft", series_id: 1, part_count: 7, duration_ms: 90000, total_cost: .12 }

describe("canonical work pages", () => {
  it("separates Series from standalone Productions in a Project", () => {
    const data: ProjectOverview = {
      resource: projectResource,
      trail: [{ id: 2, type: "venture", name: "Heartsnotes" }],
      metrics,
      series: [{ id: 1, name: "Christian prayer", description: "Recurring line", defaults: {}, metrics: { production_count: 1, part_count: 7, duration_ms: 90000, total_cost: .12 } }],
      standalone_productions: [{ ...production, id: 7, name: "Scratch", series_id: null }],
    }
    render(<ProjectPage data={data} refresh={() => undefined} />)
    expect(screen.getByRole("heading", { name: "Series" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Standalone Productions" })).toBeTruthy()
    expect(screen.getByText("Inside this Project")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Project settings for Sleeping guides/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Christian prayer/ }).getAttribute("href")).toBe("/audio-studio/series/1")
    expect(screen.getByRole("link", { name: /Scratch/ }).getAttribute("href")).toBe("/audio-studio/productions/7")
  })

  it("presents a Series as a catalog and sends audio work to Productions", () => {
    const data: SeriesOverview = {
      resource: { ...projectResource, public_id: "series-1", key: "series:1", id: 1, type: "series", project_id: 3, name: "Christian prayer" },
      trail: [{ id: 2, type: "venture", name: "Heartsnotes" }, { id: 3, type: "project", name: "Sleeping guides" }],
      defaults: { language: "Arabic" }, metrics, productions: [production],
    }
    render(<SeriesPage data={data} refresh={() => undefined} />)
    expect(screen.getByRole("heading", { name: "Productions" })).toBeTruthy()
    expect(screen.getByText("Arabic")).toBeTruthy()
    expect(screen.queryByText("Timeline")).toBeNull()
    expect(screen.getByRole("link", { name: /Falling asleep/ }).getAttribute("href")).toBe("/audio-studio/productions/6")
  })
})
