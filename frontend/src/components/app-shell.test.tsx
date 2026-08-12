// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell, activeAudioStudioDestination } from "@/components/app-shell"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { ProductReadinessProvider } from "@/design-system/vorvn"
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

function renderShell(mode: "standalone" | "embedded") {
  vi.mocked(studioApi.config).mockResolvedValue(configured)
  return render(
    <MemoryRouter initialEntries={["/audio-studio/"]}>
      <ProductReadinessProvider>
        <GlobalPlayerProvider>
          <Routes>
            <Route path="/audio-studio" element={<AppShell mode={mode} />}>
              <Route index element={<h1>Work content</h1>} />
            </Route>
          </Routes>
        </GlobalPlayerProvider>
      </ProductReadinessProvider>
    </MemoryRouter>,
  )
}

function QueryWorkspace({ queryKey }: { queryKey: "batch-job" | "subtitle-job" }) {
  const navigate = useNavigate()
  const [value, setValue] = useState("")
  return <section>
    <label>Workspace value<input aria-label={`${queryKey} workspace value`} value={value} onChange={(event) => setValue(event.target.value)} /></label>
    <button onClick={() => navigate({ search: `?${queryKey}=job-123` })}>Persist Job in URL</button>
  </section>
}

function renderQueryWorkspace(path: string, queryKey: "batch-job" | "subtitle-job") {
  vi.mocked(studioApi.config).mockResolvedValue(configured)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProductReadinessProvider><GlobalPlayerProvider><Routes>
        <Route path="/audio-studio" element={<AppShell />}>
          <Route path={queryKey === "batch-job" ? "batch" : "subtitles"} element={<QueryWorkspace queryKey={queryKey} />} />
        </Route>
      </Routes></GlobalPlayerProvider></ProductReadinessProvider>
    </MemoryRouter>,
  )
}

describe("Audio Studio shell", () => {
  it("derives one honest destination from tool and Work resource routes", () => {
    expect(activeAudioStudioDestination("/audio-studio/speak")).toBe("Speak")
    expect(activeAudioStudioDestination("/audio-studio/productions/production-id")).toBe("Work")
    expect(activeAudioStudioDestination("/audio-studio/projects/project-id")).toBe("Work")
  })
  it("renders one standalone identity and the Studio-owned navigation", async () => {
    renderShell("standalone")
    expect(screen.getByRole("link", { name: "Audio Studio Work" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Work content" })).toBeTruthy()
    await waitFor(() => expect(screen.getByText("Audio Studio ready")).toBeTruthy())
    expect(studioApi.config).toHaveBeenCalledTimes(1)
  })

  it("omits the standalone identity when mounted inside Origins", async () => {
    renderShell("embedded")
    expect(screen.queryByRole("link", { name: "Audio Studio Work" })).toBeNull()
    expect(screen.getByRole("navigation", { name: "Audio Studio tools" })).toBeTruthy()
    await waitFor(() => expect(studioApi.config).toHaveBeenCalledTimes(1))
  })

  it.each([
    ["Batch", "/audio-studio/batch", "batch-job"],
    ["Subtitles", "/audio-studio/subtitles", "subtitle-job"],
  ] as const)("keeps the %s workspace mounted when its durable Job query changes", (_name, path, queryKey) => {
    renderQueryWorkspace(path, queryKey)
    const input = screen.getByRole("textbox", { name: `${queryKey} workspace value` })
    fireEvent.change(input, { target: { value: "operator state" } })
    fireEvent.click(screen.getByRole("button", { name: "Persist Job in URL" }))
    expect((screen.getByRole("textbox", { name: `${queryKey} workspace value` }) as HTMLInputElement).value).toBe("operator state")
  })
})
