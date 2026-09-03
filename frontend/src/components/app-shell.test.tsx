// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell, activeOriginsDestination } from "@/components/app-shell"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { ProductReadinessProvider } from "@/components/product-readiness"
import { TooltipProvider } from "@/components/ui/tooltip"
import { originsApi } from "@/lib/api"

vi.mock("@/lib/api", () => ({ originsApi: { config: vi.fn(), workspaces: vi.fn() } }))

const configured = { has_key: true } as Awaited<ReturnType<typeof originsApi.config>>

function ProductionContent() {
  return <h1>Production content</h1>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(originsApi.workspaces).mockResolvedValue([{
    id: 1, public_id: "workspace-1", name: "Aduh Lagi Studio", description: "",
    project_count: 1, production_count: 1, file_count: 1, folder_count: 1,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  }])
  class AudioMock extends EventTarget {
    preload = ""
    volume = 1
    playbackRate = 1
    paused = true
    pause() {}
    removeAttribute() {}
  }
  vi.stubGlobal("Audio", AudioMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function renderShell(mode: "standalone" | "embedded", path = "/origins/", desktop = false) {
  vi.mocked(originsApi.config).mockResolvedValue(configured)
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
    matches: desktop,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <ProductReadinessProvider>
          <GlobalPlayerProvider>
            <Routes>
              <Route path="/origins" element={<AppShell mode={mode} />}>
                <Route index element={<h1>Work content</h1>} />
                <Route path="home" element={<h1>Home content</h1>} />
                <Route path="productions/audiovisual/:identifier" element={<ProductionContent />} />
              </Route>
            </Routes>
          </GlobalPlayerProvider>
        </ProductReadinessProvider>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

function QueryWorkspace({ queryKey }: { queryKey: "subtitle-job" }) {
  const navigate = useNavigate()
  const [value, setValue] = useState("")
  return <section>
    <label>Workspace value<input aria-label={`${queryKey} workspace value`} value={value} onChange={(event) => setValue(event.target.value)} /></label>
    <button onClick={() => navigate({ search: `?${queryKey}=job-123` })}>Persist Job in URL</button>
  </section>
}

function renderQueryWorkspace(path: string, queryKey: "subtitle-job") {
  vi.mocked(originsApi.config).mockResolvedValue(configured)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider><ProductReadinessProvider><GlobalPlayerProvider><Routes>
          <Route path="/origins" element={<AppShell />}>
            <Route path="create/create-subtitles" element={<QueryWorkspace queryKey={queryKey} />} />
          </Route>
        </Routes></GlobalPlayerProvider></ProductReadinessProvider></TooltipProvider>
    </MemoryRouter>,
  )
}

describe("Origins shell", () => {
  it("derives one honest destination from tool and Work resource routes", () => {
    expect(activeOriginsDestination("/origins/create/generate-speech")).toBe("Create")
    expect(activeOriginsDestination("/origins/create/create-subtitles")).toBe("Tools")
    expect(activeOriginsDestination("/origins/projects/project-id")).toBe("Projects")
    expect(activeOriginsDestination("/origins/library")).toBe("Library")
    expect(activeOriginsDestination("/origins/files")).toBe("Library")
    expect(activeOriginsDestination("/origins/voices")).toBe("Objects")
    expect(activeOriginsDestination("/origins/")).toBe("Workspaces")
    expect(activeOriginsDestination("/origins/home")).toBe("Home")
    expect(activeOriginsDestination("/origins/productions/audiovisual/production-id")).toBe("Audiovisual Production")
  })
  it("renders a global Workspace gateway without pretending one Workspace is already active", async () => {
    const { container } = renderShell("standalone", "/origins/", true)
    expect(screen.getByRole("link", { name: "Origins" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Origins utility navigation" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Work content" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-navigation")).toBe("gateway")
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
    await waitFor(() => expect(originsApi.config).toHaveBeenCalledTimes(1))
  })

  it("keeps the common Origins navigation beside desktop Production", () => {
    const { container } = renderShell("standalone", "/origins/productions/audiovisual/production-id", true)
    expect(screen.getByRole("link", { name: "Origins" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Productions" })).toBeNull()
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Production content" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("keeps one fixed desktop navigation rail without collapse machinery", async () => {
    const { container } = renderShell("standalone", "/origins/productions/audiovisual/production-id", true)
    const shell = container.querySelector(".studio-app-shell")
    expect(shell?.getAttribute("data-navigation")).toBe("rail")
    expect(screen.queryByRole("button", { name: /Origins navigation/ })).toBeNull()
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("button", { name: "Current Workspace: Aduh Lagi Studio" })).toBeTruthy())
  })

  it("exposes the approved Workspace, action and utility hierarchy", async () => {
    const { container } = renderShell("standalone", "/origins/home", true)
    const rail = container.querySelector(".studio-rail")
    expect(rail?.textContent).toContain("HomeProjectsExplorerLibraryObjects")
    expect(rail?.textContent).toContain("CreateAddTools")
    expect(rail?.textContent).toContain("ActivitySettings")
    expect(rail?.textContent).not.toContain("Subtitles")
    await waitFor(() => expect(screen.getByRole("button", { name: "Current Workspace: Aduh Lagi Studio" })).toBeTruthy())
  })

  it("preserves the normal standalone chrome for mobile Production", () => {
    const { container } = renderShell("standalone", "/origins/productions/audiovisual/production-id")
    expect(screen.getByRole("link", { name: "Origins" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("keeps the complete grouped navigation reachable on mobile", () => {
    renderShell("standalone", "/origins/home")
    fireEvent.click(screen.getByRole("button", { name: "Open Origins menu" }))
    const navigation = screen.getByRole("navigation", { name: "Origins mobile tools" })
    expect(navigation.textContent).toContain("HomeProjectsExplorerLibraryObjects")
    expect(navigation.textContent).toContain("CreateAddTools")
    expect(navigation.textContent).toContain("ActivitySettings")
    expect(within(navigation).getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page")
  })

  it("does not infer authority over an embedded host on desktop Production", () => {
    const { container } = renderShell("embedded", "/origins/productions/audiovisual/production-id", true)
    expect(screen.queryByRole("link", { name: "Origins" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("omits the standalone identity when mounted inside Origins", async () => {
    renderShell("embedded")
    expect(screen.queryByRole("link", { name: "Origins" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Origins utility navigation" })).toBeTruthy()
    await waitFor(() => expect(originsApi.config).toHaveBeenCalledTimes(1))
  })

  it("keeps the Subtitles workspace mounted when its durable Job query changes", () => {
    const queryKey = "subtitle-job" as const
    renderQueryWorkspace("/origins/create/create-subtitles", queryKey)
    const input = screen.getByRole("textbox", { name: `${queryKey} workspace value` })
    fireEvent.change(input, { target: { value: "operator state" } })
    fireEvent.click(screen.getByRole("button", { name: "Persist Job in URL" }))
    expect((screen.getByRole("textbox", { name: `${queryKey} workspace value` }) as HTMLInputElement).value).toBe("operator state")
  })
})
