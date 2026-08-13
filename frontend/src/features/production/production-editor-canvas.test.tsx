// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

const timing = vi.hoisted(() => vi.fn(() => <div>Timing mounted</div>))
vi.mock("@/components/timing-overview", () => ({ TimingOverview: timing }))
vi.mock("@/components/production-header", () => ({ ProductionHeader: () => null }))
vi.mock("@/components/sequence-workspace", () => ({ SequenceWorkspace: () => null }))
vi.mock("@/features/production/production-cast-strip", () => ({ ProductionCastStrip: () => null }))
vi.mock("@/features/production/cast-manager-sheet", () => ({ CastManagerSheet: () => null }))
vi.mock("@/features/production/production-command-menu", () => ({ ProductionCommandMenu: () => null }))
vi.mock("@/features/production/production-explorer-sheet", () => ({ ProductionExplorerSheet: () => null }))
vi.mock("@/features/production/production-health-sheet", () => ({ productionHealth: () => [], ProductionHealthSheet: () => null }))
vi.mock("@/features/production/mix-export-workspace", () => ({ MixExportWorkspace: () => null }))

import { ProductionEditorCanvas } from "./production-editor-canvas"

describe("ProductionEditorCanvas timing", () => {
  it("does not mount or decode the timing surface while its section is collapsed", () => {
    const props = {
      production: { id: 7, key: "production", title: "Production", parts: [] },
      tree: null, music: {}, directory: {}, cast: [], liveJobs: {}, duration: 0,
      releaseOpen: false, composerOpen: false, explorerOpen: false, castOpen: false,
      healthOpen: false, commandsOpen: false, selected: new Set(), playerPlaying: false,
      previewing: false, productionPlaying: false, productionLoaded: false,
      productionCurrentTime: 0, exporting: false, exportJob: null,
      onReleaseOpen: vi.fn(), onExplorerOpen: vi.fn(), onCastOpen: vi.fn(),
      onHealthOpen: vi.fn(), onCommandsOpen: vi.fn(), onCastChanged: vi.fn(),
      onTool: vi.fn(), onSelected: vi.fn(), onPreview: vi.fn(), onLocate: vi.fn(),
      onSeekProduction: vi.fn(), onPlay: vi.fn(), onMusicChange: vi.fn(),
      onChooseMusic: vi.fn(), onExport: vi.fn(), onRetryJob: vi.fn(),
      onConfirmJob: vi.fn(), onReplaceAsset: vi.fn(), sequenceActions: {},
    } as unknown as ComponentProps<typeof ProductionEditorCanvas>
    render(<ProductionEditorCanvas {...props} />)
    expect(timing).not.toHaveBeenCalled()
    const details = screen.getByText(/Preview, timing & music/i).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    expect(screen.getByText("Timing mounted")).toBeTruthy()
    expect(timing).toHaveBeenCalledTimes(1)
  })
})
