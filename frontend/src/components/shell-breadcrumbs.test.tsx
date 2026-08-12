// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import { ShellBreadcrumbs } from "./shell-breadcrumbs"

afterEach(cleanup)

describe("ShellBreadcrumbs", () => {
  it("keeps every ancestor navigable and carries the Venture identity", () => {
    render(<MemoryRouter><ShellBreadcrumbs trail={[{ id: 2, public_id: "vnt_heartsnotes", type: "venture", name: "Heartsnotes", icon: "💜" }, { id: 3, public_id: "prj_sleeping", type: "project", name: "Sleeping guides" }]} current={{ type: "production", name: "Falling asleep" }} /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Ventures" }).getAttribute("href")).toBe("/audio-studio/")
    expect(screen.getByRole("link", { name: /Heartsnotes/ }).getAttribute("href")).toBe("/audio-studio/ventures/vnt_heartsnotes")
    expect(screen.getByRole("link", { name: "Sleeping guides" }).getAttribute("href")).toBe("/audio-studio/projects/prj_sleeping")
    expect(screen.getByText("Falling asleep").parentElement?.getAttribute("aria-current")).toBe("page")
  })
})
