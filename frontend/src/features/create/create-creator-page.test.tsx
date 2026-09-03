// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { CreateCreatorPage } from "./create-creator-page"

const refresh = vi.fn(async () => undefined)

vi.mock("@/hooks/use-workspace-explorer", () => ({ useWorkspaceExplorer: () => ({
  workspaces: { status: "ready", data: [{ id: 4, name: "Sandbox" }] },
  overview: { status: "ready", data: { workspace: { id: 4, name: "Sandbox", description: "Test Workspace" }, files: [], projects: [], productions: [], folders: [] } },
  actions: { status: "ready", data: [] },
  selectedWorkspaceId: 4,
  setSelectedWorkspaceId: vi.fn(),
  refresh,
  refreshWorkspaces: refresh,
  refreshActions: refresh,
}) }))

vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => ({
  source: null, state: "idle", toggleSource: vi.fn(),
}) }))

vi.mock("@/features/creator/audio/audio-creator", () => ({
  AudioCreator: (props: {
    context: { workspace_id: number; folder_id?: number | null }
    fixedCapability: string
    onResult?: (result: { file_ids: number[] }) => Promise<void>
  }) => <button
    type="button"
    data-workspace-id={props.context.workspace_id}
    data-folder-id={props.context.folder_id}
    data-capability={props.fixedCapability}
    onClick={() => void props.onResult?.({ file_ids: [9] })}
  >Keep generated file</button>,
}))

vi.mock("@/features/creator/speech/speech-creator-page", () => ({
  SpeechCreatorPage: ({ embedded }: { embedded?: boolean }) => <div data-testid="speech-creator" data-embedded={String(embedded)}>Speech controls</div>,
}))

vi.mock("@/features/creator/subtitles/subtitle-creator-page", () => ({
  SubtitleCreatorPage: ({ embedded }: { embedded?: boolean }) => <div data-testid="subtitle-creator" data-embedded={String(embedded)}>Subtitle controls</div>,
}))

vi.mock("@/features/creator/media/media-creator", () => ({
  MediaCreator: (props: {
    context: { selection?: { output_media_type?: string } }
    renderWorkspace: (workspace: { creator: React.ReactNode; library: React.ReactNode; creatorDetail?: string }) => React.ReactNode
  }) => props.renderWorkspace({
    creatorDetail: props.context.selection?.output_media_type,
    creator: <div data-testid="media-creator" data-output={props.context.selection?.output_media_type}>Media controls</div>,
    library: <div>Shared Library</div>,
  }),
}))

vi.mock("@/lib/api", () => ({ originsApi: {
  keepGeneratedAudioInWorkspace: vi.fn(async () => ({ file: { id: 9 }, duplicate: false })),
} }))

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe("CreateCreatorPage", () => {
  it("runs music creation directly in the current Workspace and keeps a File", async () => {
    render(<MemoryRouter initialEntries={["/origins/create/generate-music?folder_id=27"]}><Routes><Route path="/origins/create/:actionId" element={<CreateCreatorPage />} /></Routes></MemoryRouter>)

    expect(screen.getByRole("dialog", { name: "Create music" })).toBeTruthy()
    expect(screen.getAllByText(/Create music/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Sandbox").length).toBeGreaterThan(0)
    const workspace = screen.getByRole("button", { name: "Keep generated file" })
    expect(workspace.getAttribute("data-workspace-id")).toBe("4")
    expect(workspace.getAttribute("data-capability")).toBe("music")
    expect(workspace.getAttribute("data-folder-id")).toBe("27")

    fireEvent.click(workspace)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it.each([
    ["generate-speech", "Create speech", "speech-creator"],
    ["create-subtitles", "Create subtitles", "subtitle-creator"],
  ])("keeps %s inside the canonical creation route", async (actionId, title, testId) => {
    render(<MemoryRouter initialEntries={[`/origins/create/${actionId}`]}><Routes><Route path="/origins/create/:actionId" element={<CreateCreatorPage />} /></Routes></MemoryRouter>)

    expect(screen.getByRole("dialog", { name: title })).toBeTruthy()
    expect(screen.getAllByText(new RegExp(title)).length).toBeGreaterThan(0)
    const panel = await screen.findByTestId(testId)
    expect(panel.getAttribute("data-embedded")).toBe("true")
  })

  it.each([
    ["generate-image", "Create image", "image"],
    ["generate-video", "Create video", "video"],
  ])("opens %s through the universal CreatorHost", async (actionId, title, capability) => {
    render(<MemoryRouter initialEntries={[`/origins/create/${actionId}`]}><Routes><Route path="/origins/create/:actionId" element={<CreateCreatorPage />} /></Routes></MemoryRouter>)

    expect(screen.getByRole("dialog", { name: title })).toBeTruthy()
    const panel = await screen.findByTestId("media-creator")
    expect(panel.getAttribute("data-output")).toBe(capability)
    expect(screen.getByRole("button", { name: capability === "image" ? "Image" : "Video" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText("Shared Library")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Speech" }))
    expect(await screen.findByTestId("speech-creator")).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "Create speech" })).toBeTruthy()
  })
})
