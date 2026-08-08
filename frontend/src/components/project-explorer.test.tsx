// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ProductionExplorer } from "./project-explorer"
import type { HierarchyNode } from "@/types/domain"

globalThis.ResizeObserver = class ResizeObserver { observe() {}; unobserve() {}; disconnect() {} } as typeof ResizeObserver
afterEach(cleanup)

const base = { description: "", icon: "", locked: false, metrics: { parts: 0, cost: 0 } }
const nodes: HierarchyNode[] = [
  { ...base, id: 2, key: "venture:2", type: "venture", parent_key: null, name: "Heartsnotes" },
  { ...base, id: 3, key: "project:3", type: "project", parent_key: "venture:2", name: "Sleeping guides" },
  { ...base, id: 1, key: "series:1", type: "series", parent_key: "project:3", name: "Christian prayer" },
  { ...base, id: 6, key: "production:6", type: "production", parent_key: "series:1", name: "Falling asleep" },
  { ...base, id: 7, key: "production:7", type: "production", parent_key: "project:3", name: "Standalone scratch" },
]

describe("ProductionExplorer", () => {
  it("keeps every ancestor visible when searching a deeply nested Production", () => {
    render(<ProductionExplorer nodes={nodes} activeKey="production:6" />)
    fireEvent.change(screen.getByPlaceholderText("Find a Production"), { target: { value: "falling" } })
    expect(screen.getByText("Heartsnotes")).toBeTruthy()
    expect(screen.getByText("Sleeping guides")).toBeTruthy()
    expect(screen.getByText("Christian prayer")).toBeTruthy()
    expect(screen.getByText("Falling asleep")).toBeTruthy()
  })

  it("finds a standalone Production under a Project", () => {
    render(<ProductionExplorer nodes={nodes} activeKey="production:6" />)
    fireEvent.change(screen.getByPlaceholderText("Find a Production"), { target: { value: "standalone" } })
    expect(screen.getByText("Standalone scratch")).toBeTruthy()
  })
})
