// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell, OriginsRailToggle, activeOriginsDestination } from "@/components/app-shell"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { ProductReadinessProvider } from "@/components/product-readiness"
import { TooltipProvider } from "@/components/ui/tooltip"
import { originsApi } from "@/lib/api"

vi.mock("@/lib/api", () => ({ originsApi: { config: vi.fn() } }))

const configured = { has_key: true } as Awaited<ReturnType<typeof originsApi.config>>

function ProductionContent() {
  return <><OriginsRailToggle className="production-header-toggle" /><h1>Production content</h1></>
}

beforeEach(() => {
  vi.clearAllMocks()
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
    expect(activeOriginsDestination("/origins/create/create-subtitles")).toBe("Create")
    expect(activeOriginsDestination("/origins/projects/project-id")).toBe("Projects")
    expect(activeOriginsDestination("/origins/productions/audiovisual/production-id")).toBe("Productions")
  })
  it("renders one standalone identity and the Studio-owned navigation", async () => {
    const { container } = renderShell("standalone", "/origins/", true)
    expect(screen.getByRole("link", { name: "Origins Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Work content" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
    await waitFor(() => expect(screen.getByText("Origins ready")).toBeTruthy())
    expect(originsApi.config).toHaveBeenCalledTimes(1)
  })

  it("keeps the common Origins navigation beside desktop Production", () => {
    const { container } = renderShell("standalone", "/origins/productions/audiovisual/production-id", true)
    expect(screen.getByRole("link", { name: "Origins Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Productions" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("heading", { name: "Production content" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("keeps the desktop navigation rail collapsible inside its own surface", () => {
    const { container } = renderShell("standalone", "/origins/productions/audiovisual/production-id", true)
    const shell = container.querySelector(".studio-app-shell")
    expect(shell?.getAttribute("data-navigation")).toBe("rail")
    expect(shell?.getAttribute("data-rail-expanded")).toBe("false")
    expect(container.querySelector(".studio-rail .studio-rail-toggle")).toBeNull()
    expect(container.querySelector(".production-header-toggle")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Expand Origins navigation" }))
    expect(shell?.getAttribute("data-rail-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "Collapse Origins navigation" })).toBeTruthy()
  })

  it("keeps creation tools behind Create instead of bloating the permanent rail", () => {
    const { container } = renderShell("standalone", "/origins/", true)
    const primary = container.querySelector(".studio-rail-group:not(.is-tools)")
    expect(primary?.textContent).toContain("Create")
    expect(primary?.textContent).not.toContain("Subtitles")
    expect(primary?.textContent).not.toContain("Activity")
  })

  it("preserves the normal standalone chrome for mobile Production", () => {
    const { container } = renderShell("standalone", "/origins/productions/audiovisual/production-id")
    expect(screen.getByRole("link", { name: "Origins Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("does not infer authority over an embedded host on desktop Production", () => {
    const { container } = renderShell("embedded", "/origins/productions/audiovisual/production-id", true)
    expect(screen.queryByRole("link", { name: "Origins Work" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("omits the standalone identity when mounted inside Origins", async () => {
    renderShell("embedded")
    expect(screen.queryByRole("link", { name: "Origins Work" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Origins tools" })).toBeTruthy()
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
