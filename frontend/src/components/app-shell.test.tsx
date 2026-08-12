// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppShell } from "@/components/app-shell"
import { ProductReadinessProvider } from "@/design-system/vorvn"
import { studioApi } from "@/lib/api"

vi.mock("@/lib/api", () => ({ studioApi: { config: vi.fn() } }))

const configured = { has_key: true } as Awaited<ReturnType<typeof studioApi.config>>

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function renderShell(mode: "standalone" | "embedded") {
  vi.mocked(studioApi.config).mockResolvedValue(configured)
  return render(
    <MemoryRouter initialEntries={["/audio-studio/"]}>
      <ProductReadinessProvider>
        <Routes>
          <Route path="/audio-studio" element={<AppShell mode={mode} />}>
            <Route index element={<h1>Work content</h1>} />
          </Route>
        </Routes>
      </ProductReadinessProvider>
    </MemoryRouter>,
  )
}

describe("Audio Studio shell", () => {
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
})
