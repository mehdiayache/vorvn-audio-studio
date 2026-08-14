// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const timing = vi.hoisted(() => vi.fn(() => <div>Timing mounted</div>))
vi.mock("@/components/timing-overview", () => ({ TimingOverview: timing }))
vi.mock("@/components/production-header", () => ({ ProductionHeader: () => null }))
vi.mock("@/components/sequence-workspace", () => ({ SequenceWorkspace: () => null }))
vi.mock("@/features/production/production-command-menu", () => ({ ProductionCommandMenu: () => null }))
vi.mock("@/features/production/production-explorer-sheet", () => ({ ProductionExplorerSheet: () => null }))
vi.mock("@/features/production/production-health-sheet", () => ({ productionHealth: () => [], ProductionHealthSheet: () => null }))
vi.mock("@/features/production/production-stage", () => ({ ProductionStage: ({ canvas, children }: { canvas: ReactNode; children: ReactNode }) => <>{canvas}{children}</> }))

import { ProductionEditorCanvas } from "./production-editor-canvas"

describe("ProductionEditorCanvas timing", () => {
  afterEach(cleanup)

  it("does not mount or decode the timing surface while its section is collapsed", () => {
    const props = {
      production: { id: 7, key: "production", title: "Production", parts: [] },
      tree: null, music: {}, directory: {}, liveJobs: {}, duration: 0,
      stageMode: null, stageTitle: "Production", stageContent: null,
      explorerOpen: false,
      healthOpen: false, commandsOpen: false, selected: new Set(), playerPlaying: false,
      previewing: false, productionPlaying: false, productionLoaded: false,
      productionCurrentTime: 0,
      onOpenMixExport: vi.fn(), onCloseStage: vi.fn(), onExplorerOpen: vi.fn(),
      onHealthOpen: vi.fn(), onCommandsOpen: vi.fn(), onMusicOpen: vi.fn(),
      onTool: vi.fn(), onSelected: vi.fn(), onPreview: vi.fn(), onLocate: vi.fn(),
      onSeekProduction: vi.fn(), onPlay: vi.fn(),
      onChooseMusic: vi.fn(), onRetryJob: vi.fn(),
      onConfirmJob: vi.fn(), onReplaceAsset: vi.fn(), sequenceActions: {},
    } as unknown as ComponentProps<typeof ProductionEditorCanvas>
    render(<ProductionEditorCanvas {...props} />)
    expect(timing).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Timing" }))
    expect(screen.getByText("Timing mounted")).toBeTruthy()
    expect(timing).toHaveBeenCalledTimes(1)
  })

  it("restores the full sequence before locating a search result", async () => {
    const onLocate = vi.fn()
    const props = {
      production: { id: 7, key: "production", title: "Production", parts: [{ id: 17, kind: "draft", text: "Harbor ending" }] },
      tree: null, music: {}, directory: {}, liveJobs: {}, duration: 0,
      stageMode: null, stageTitle: "Production", stageContent: null,
      explorerOpen: false, healthOpen: false, commandsOpen: false, selected: new Set(), playerPlaying: false,
      previewing: false, productionPlaying: false, productionLoaded: false, productionCurrentTime: 0,
      onOpenMixExport: vi.fn(), onCloseStage: vi.fn(), onExplorerOpen: vi.fn(),
      onHealthOpen: vi.fn(), onCommandsOpen: vi.fn(), onMusicOpen: vi.fn(),
      onTool: vi.fn(), onSelected: vi.fn(), onPreview: vi.fn(), onLocate,
      onSeekProduction: vi.fn(), onPlay: vi.fn(), onChooseMusic: vi.fn(), onRetryJob: vi.fn(),
      onConfirmJob: vi.fn(), onReplaceAsset: vi.fn(), sequenceActions: {},
    } as unknown as ComponentProps<typeof ProductionEditorCanvas>

    render(<ProductionEditorCanvas {...props} />)
    fireEvent.click(screen.getByRole("button", { name: "Search / Jump" }))
    fireEvent.change(screen.getByPlaceholderText("Script, Voice, or Part number"), { target: { value: "harbor" } })
    fireEvent.click(screen.getByRole("option", { name: /Harbor ending/ }))

    await waitFor(() => expect(onLocate).toHaveBeenCalledWith(17))
    expect(screen.getByRole("button", { name: "Search / Jump" })).toBeTruthy()
  })
})
