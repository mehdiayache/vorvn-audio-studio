// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell, activeAudioStudioDestination } from "@/components/app-shell"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { ProductReadinessProvider } from "@/components/product-readiness"
import { TooltipProvider } from "@/components/ui/tooltip"
import { studioApi } from "@/lib/api"

vi.mock("@/lib/api", () => ({ studioApi: { config: vi.fn() } }))

const configured = { has_key: true } as Awaited<ReturnType<typeof studioApi.config>>

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

function renderShell(mode: "standalone" | "embedded", path = "/audio-studio/", desktop = false) {
  vi.mocked(studioApi.config).mockResolvedValue(configured)
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
              <Route path="/audio-studio" element={<AppShell mode={mode} />}>
                <Route index element={<h1>Work content</h1>} />
                <Route path="productions/:identifier" element={<h1>Production content</h1>} />
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
  vi.mocked(studioApi.config).mockResolvedValue(configured)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider><ProductReadinessProvider><GlobalPlayerProvider><Routes>
          <Route path="/audio-studio" element={<AppShell />}>
            <Route path="subtitles" element={<QueryWorkspace queryKey={queryKey} />} />
          </Route>
        </Routes></GlobalPlayerProvider></ProductReadinessProvider></TooltipProvider>
    </MemoryRouter>,
  )
}

describe("Audio Studio shell", () => {
  it("derives one honest destination from tool and Work resource routes", () => {
    expect(activeAudioStudioDestination("/audio-studio/speak")).toBe("Create")
    expect(activeAudioStudioDestination("/audio-studio/productions/production-id")).toBe("Productions")
    expect(activeAudioStudioDestination("/audio-studio/projects/project-id")).toBe("Productions")
  })
  it("renders one standalone identity and the Studio-owned navigation", async () => {
    const { container } = renderShell("standalone", "/audio-studio/", true)
    expect(screen.getByRole("link", { name: "Audio Studio Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Work content" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
    await waitFor(() => expect(screen.getByText("Audio Studio ready")).toBeTruthy())
    expect(studioApi.config).toHaveBeenCalledTimes(1)
  })

  it("keeps the common Audio Studio navigation above desktop Production", () => {
    const { container } = renderShell("standalone", "/audio-studio/productions/production-id", true)
    expect(screen.getByRole("link", { name: "Audio Studio Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Productions" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("heading", { name: "Production content" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("preserves the normal standalone chrome for mobile Production", () => {
    const { container } = renderShell("standalone", "/audio-studio/productions/production-id")
    expect(screen.getByRole("link", { name: "Audio Studio Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("does not infer authority over an embedded host on desktop Production", () => {
    const { container } = renderShell("embedded", "/audio-studio/productions/production-id", true)
    expect(screen.queryByRole("link", { name: "Audio Studio Work" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    expect(container.querySelector(".studio-app-shell")?.getAttribute("data-presentation")).toBe("standard")
  })

  it("omits the standalone identity when mounted inside Origins", async () => {
    renderShell("embedded")
    expect(screen.queryByRole("link", { name: "Audio Studio Work" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    await waitFor(() => expect(studioApi.config).toHaveBeenCalledTimes(1))
  })

  it("keeps the Subtitles workspace mounted when its durable Job query changes", () => {
    const queryKey = "subtitle-job" as const
    renderQueryWorkspace("/audio-studio/subtitles", queryKey)
    const input = screen.getByRole("textbox", { name: `${queryKey} workspace value` })
    fireEvent.change(input, { target: { value: "operator state" } })
    fireEvent.click(screen.getByRole("button", { name: "Persist Job in URL" }))
    expect((screen.getByRole("textbox", { name: `${queryKey} workspace value` }) as HTMLInputElement).value).toBe("operator state")
  })
})
