// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { SpaceAudioCreationPage } from "./space-audio-creation-page"

const refresh = vi.fn(async () => undefined)

vi.mock("@/hooks/use-space-home", () => ({ useSpaceHome: () => ({
  spaces: { status: "ready", data: [{ id: 4, name: "Sandbox" }] },
  overview: { status: "ready", data: { space: { id: 4, name: "Sandbox" } } },
  selectedSpaceId: 4,
  refresh,
}) }))

vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => ({
  source: null, state: "idle", toggleSource: vi.fn(),
}) }))

vi.mock("@/components/production-tools/generation-workspace", () => ({
  GenerationWorkspace: (props: {
    spaceId: number
    fixedCapability: string
    allowPlacement: boolean
    onKeep: (folder: string, input: { candidateId: string; name: string; category: "music"; scope: "space"; tags: string[] }) => Promise<unknown>
    onKept: (file: unknown, category: "music") => Promise<void>
  }) => <button
    type="button"
    data-space-id={props.spaceId}
    data-capability={props.fixedCapability}
    data-placement={String(props.allowPlacement)}
    onClick={async () => {
      const kept = await props.onKeep("Files", { candidateId: "candidate-1", name: "Quiet score", category: "music", scope: "space", tags: ["calm"] })
      await props.onKept(kept, "music")
    }}
  >Keep generated file</button>,
}))

vi.mock("@/lib/api", () => ({ studioApi: {
  keepGeneratedAudioInSpace: vi.fn(async () => ({ asset: { id: 9 }, duplicate: false })),
} }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("SpaceAudioCreationPage", () => {
  it("runs music creation directly in the current Space and keeps a File", async () => {
    render(<MemoryRouter initialEntries={["/audio-studio/create/generate-music"]}><Routes><Route path="/audio-studio/create/:actionId" element={<SpaceAudioCreationPage />} /></Routes></MemoryRouter>)

    expect(screen.getByRole("heading", { name: "Generate music" })).toBeTruthy()
    expect(screen.getByText("Sandbox")).toBeTruthy()
    const workspace = screen.getByRole("button", { name: "Keep generated file" })
    expect(workspace.getAttribute("data-space-id")).toBe("4")
    expect(workspace.getAttribute("data-capability")).toBe("music")
    expect(workspace.getAttribute("data-placement")).toBe("false")

    fireEvent.click(workspace)
    await waitFor(() => expect(studioApi.keepGeneratedAudioInSpace).toHaveBeenCalledWith("candidate-1", 4, {
      name: "Quiet score", category: "music", tags: ["calm"],
    }))
    expect(refresh).toHaveBeenCalled()
  })
})
