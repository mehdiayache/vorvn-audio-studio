// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { CreateComposerPage } from "./create-composer-page"

const refresh = vi.fn(async () => undefined)

vi.mock("@/hooks/use-workspace-explorer", () => ({ useWorkspaceExplorer: () => ({
  workspaces: { status: "ready", data: [{ id: 4, name: "Sandbox" }] },
  overview: { status: "ready", data: { workspace: { id: 4, name: "Sandbox" }, files: [] } },
  selectedWorkspaceId: 4,
  refresh,
}) }))

vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => ({
  source: null, state: "idle", toggleSource: vi.fn(),
}) }))

vi.mock("@/features/composer/audio/audio-composer", () => ({
  AudioComposer: (props: {
    workspaceId: number
    fixedCapability: string
    allowPlacement: boolean
    onKeep: (folder: string, input: { candidateId: string; name: string; category: "music"; tags: string[] }) => Promise<unknown>
    onKept: (file: unknown, category: "music") => Promise<void>
  }) => <button
    type="button"
    data-workspace-id={props.workspaceId}
    data-capability={props.fixedCapability}
    data-placement={String(props.allowPlacement)}
    onClick={async () => {
      const kept = await props.onKeep("Files", { candidateId: "candidate-1", name: "Quiet score", category: "music", tags: ["calm"] })
      await props.onKept(kept, "music")
    }}
  >Keep generated file</button>,
}))

vi.mock("@/lib/api", () => ({ originsApi: {
  keepGeneratedAudioInWorkspace: vi.fn(async () => ({ file: { id: 9 }, duplicate: false })),
} }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("CreateComposerPage", () => {
  it("runs music creation directly in the current Workspace and keeps a File", async () => {
    render(<MemoryRouter initialEntries={["/origins/create/generate-music?folder_id=27"]}><Routes><Route path="/origins/create/:actionId" element={<CreateComposerPage />} /></Routes></MemoryRouter>)

    expect(screen.getByRole("heading", { name: "Generate music" })).toBeTruthy()
    expect(screen.getByText("Sandbox")).toBeTruthy()
    const workspace = screen.getByRole("button", { name: "Keep generated file" })
    expect(workspace.getAttribute("data-workspace-id")).toBe("4")
    expect(workspace.getAttribute("data-capability")).toBe("music")
    expect(workspace.getAttribute("data-placement")).toBe("false")

    fireEvent.click(workspace)
    await waitFor(() => expect(originsApi.keepGeneratedAudioInWorkspace).toHaveBeenCalledWith("candidate-1", 4, {
      name: "Quiet score", category: "music", tags: ["calm"], folder_id: 27,
    }))
    expect(refresh).toHaveBeenCalled()
  })
})
