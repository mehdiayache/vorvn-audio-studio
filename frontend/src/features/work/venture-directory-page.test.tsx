// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import type { HierarchyNode } from "@/types/domain"
import { VentureDirectoryPage } from "./venture-directory-page"

afterEach(cleanup)

const metrics = { parts: 0, cost: 0 }
const items = [
  { id: 1, public_id: "v1", key: "venture:1", parent_key: null, type: "venture", name: "Heartsnotes", description: "", icon: "", locked: false, metrics },
  { id: 2, public_id: "p1", key: "project:2", parent_key: "venture:1", type: "project", name: "Sleep", description: "", icon: "", locked: false, metrics },
  { id: 3, public_id: "s1", key: "series:3", parent_key: "project:2", type: "series", name: "Prayer", description: "", icon: "", locked: false, metrics },
  { id: 4, public_id: "r1", key: "production:4", parent_key: "series:3", type: "production", name: "Episode", description: "", icon: "", locked: false, metrics },
  { id: 5, public_id: "r2", key: "production:5", parent_key: "project:2", type: "production", name: "One-off", description: "", icon: "", locked: false, metrics },
] satisfies HierarchyNode[]

describe("VentureDirectoryPage", () => {
  it("counts Project and nested Production descendants without treating Ventures as folders", () => {
    render(<MemoryRouter><VentureDirectoryPage items={items} /></MemoryRouter>)
    const venture = screen.getByRole("link", { name: /Venture Heartsnotes/ })
    expect(venture.getAttribute("href")).toBe("/audio-studio/ventures/v1")
    expect(screen.getByText("1 Project")).toBeTruthy()
    expect(screen.getByText("2 Productions")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Work" })).toBeTruthy()
  })
})
