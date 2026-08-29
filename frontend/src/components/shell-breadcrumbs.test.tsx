// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import { ShellBreadcrumbs } from "./shell-breadcrumbs"
import type { HierarchyNode } from "@/types/domain"

afterEach(cleanup)

describe("ShellBreadcrumbs", () => {
  it("supports a top-level Studio tool without inventing a hierarchy resource", () => {
    render(<MemoryRouter><ShellBreadcrumbs leaf="Voices" /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Auvi Studio" }).getAttribute("href")).toBe("/audio-studio/")
    expect(screen.getByText("Voices").parentElement?.getAttribute("aria-current")).toBe("page")
  })

  it("keeps every ancestor navigable and carries the Venture identity", () => {
    render(<MemoryRouter><ShellBreadcrumbs trail={[{ id: 2, public_id: "vnt_heartsnotes", type: "venture", name: "Heartsnotes", icon: "💜" }, { id: 3, public_id: "prj_sleeping", type: "project", name: "Sleeping guides" }]} current={{ type: "production", name: "Falling asleep" }} /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Auvi Studio" }).getAttribute("href")).toBe("/audio-studio/")
    expect(screen.getByRole("link", { name: /Heartsnotes/ }).getAttribute("href")).toBe("/audio-studio/ventures/vnt_heartsnotes")
    expect(screen.getByRole("link", { name: "Sleeping guides" }).getAttribute("href")).toBe("/audio-studio/projects/prj_sleeping")
    expect(screen.getByText("Falling asleep").parentElement?.getAttribute("aria-current")).toBe("page")
  })

  it("switches between sibling hierarchy items from the breadcrumb itself", async () => {
    const metrics = { cost: 0, parts: 0 }
    const tree = [
      { id: 2, public_id: "vnt_heartsnotes", key: "venture:2", parent_key: null, type: "venture", name: "Heartsnotes", description: "", icon: "💜", locked: false, metrics },
      { id: 4, public_id: "vnt_sandbox", key: "venture:4", parent_key: null, type: "venture", name: "Sandbox", description: "", icon: "🧪", locked: false, metrics },
    ] satisfies HierarchyNode[]
    render(<MemoryRouter><ShellBreadcrumbs tree={tree} trail={[{ id: 2, public_id: "vnt_heartsnotes", type: "venture", name: "Heartsnotes", icon: "💜" }]} /></MemoryRouter>)

    fireEvent.pointerDown(screen.getByRole("button", { name: /Heartsnotes/ }), { button: 0, ctrlKey: false })
    expect((await screen.findByRole("menuitem", { name: /Sandbox/ })).getAttribute("href")).toBe("/audio-studio/ventures/vnt_sandbox")
  })
})
