// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ShellBreadcrumbs } from "./shell-breadcrumbs"

afterEach(cleanup)

describe("ShellBreadcrumbs", () => {
  it("keeps every ancestor navigable and carries the Venture identity", () => {
    render(<ShellBreadcrumbs trail={[{ id: 2, type: "venture", name: "Heartsnotes", icon: "💜" }, { id: 3, type: "project", name: "Sleeping guides" }]} current={{ type: "production", name: "Falling asleep" }} />)
    expect(screen.getByRole("link", { name: "Ventures" }).getAttribute("href")).toBe("/audio-studio/")
    expect(screen.getByRole("link", { name: /Heartsnotes/ }).getAttribute("href")).toBe("/audio-studio/ventures/2")
    expect(screen.getByRole("link", { name: "Sleeping guides" }).getAttribute("href")).toBe("/audio-studio/projects/3")
    expect(screen.getByText("Falling asleep").parentElement?.getAttribute("aria-current")).toBe("page")
  })
})
