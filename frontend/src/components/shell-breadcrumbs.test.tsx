// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { ShellBreadcrumbs } from "./shell-breadcrumbs"

describe("ShellBreadcrumbs", () => {
  it("anchors utility pages in Origins", () => {
    render(<MemoryRouter><ShellBreadcrumbs leaf="Voices" /></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Origins" }).getAttribute("href")).toBe("/origins/")
    expect(screen.getByText("Voices").getAttribute("aria-current")).toBe("page")
  })
})
