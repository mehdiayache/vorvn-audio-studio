// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  attachProductionLibraryFile: vi.fn(),
  workspace: vi.fn(),
}))

vi.mock("@/lib/api", () => ({ originsApi: api }))
vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => ({
  source: null, state: "idle", toggleSource: vi.fn(),
}) }))
vi.mock("@/features/creator/creator-capability-dispatcher", () => ({
  CreatorCapabilityDispatcher: ({ session, onResult, resultAction }: {
    session: { capability: string; context: { production_id?: number | null }; renderWorkspace: (value: { creator: React.ReactNode; library: React.ReactNode }) => React.ReactNode }
    onResult: (result: { file_ids: number[] }) => Promise<void>
    resultAction?: { label: string; run: (result: { file_ids: number[] }) => Promise<void> }
  }) => session.renderWorkspace({
    creator: <div>
      <span data-testid="active-capability">{session.capability}</span>
      <span data-testid="production-context">{session.context.production_id}</span>
      <button type="button" onClick={() => void onResult({ file_ids: [91] })}>Finish speech</button>
      {resultAction && <button type="button" onClick={() => void resultAction.run({ file_ids: [91] })}>{resultAction.label}</button>}
    </div>,
    library: <div>Production Files</div>,
  }),
}))

import { ProductionLibraryStage } from "../library/production-library-stage"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("Audiovisual Library Creator result handling", () => {
  it("links Speech CreatorResult to the Production and keeps Timeline as a host action", async () => {
    const speech = { id: 91, media_type: "audio" as const, name: "Guide speech", filename: "guide.mp3" }
    api.attachProductionLibraryFile.mockResolvedValue({ file_id: 91, duplicate: false })
    api.workspace.mockResolvedValue({ files: [speech] })
    const refresh = vi.fn().mockResolvedValue(undefined)
    const addToTimeline = vi.fn().mockResolvedValue(undefined)

    render(<ProductionLibraryStage
      productionId={7}
      workspaceId={4}
      files={[speech]}
      libraryFileIds={[]}
      onUpload={vi.fn()}
      onRefresh={refresh}
      onAddToTimeline={addToTimeline}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Speech" }))
    expect((await screen.findByTestId("active-capability")).textContent).toBe("speech")
    expect(screen.getByTestId("production-context").textContent).toBe("7")

    fireEvent.click(screen.getByRole("button", { name: "Finish speech" }))
    await waitFor(() => expect(api.attachProductionLibraryFile).toHaveBeenCalledWith(7, 91))
    expect(refresh).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole("button", { name: "Add to Timeline" }))
    await waitFor(() => expect(api.workspace).toHaveBeenCalledWith(4))
    expect(addToTimeline).toHaveBeenCalledWith(speech)
  })
})
