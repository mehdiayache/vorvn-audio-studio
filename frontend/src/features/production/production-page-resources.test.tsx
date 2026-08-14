// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ productionCast: vi.fn() }))
vi.mock("@/lib/api", () => ({ studioApi: api }))
vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => ({ source: null, state: "idle", currentTime: 0, seek: vi.fn(), toggleSource: vi.fn(), pause: vi.fn(), close: vi.fn() }) }))
vi.mock("@/hooks/use-player-shortcuts", () => ({ usePlayerShortcuts: vi.fn() }))
vi.mock("@/features/production/use-production-speech-jobs", () => ({ useProductionSpeechJobs: () => ({}) }))
vi.mock("@/hooks/use-production-actions", () => ({ useProductionActions: () => ({
  playerPlaying: false, previewing: false, productionPlaying: false, productionLoaded: false,
  exporting: false, exportJob: null, duplicatePart: vi.fn(), deletePart: vi.fn(), deleteParts: vi.fn(),
  movePart: vi.fn(), movePartToPosition: vi.fn(), editSilence: vi.fn(), moveParts: vi.fn(),
  toggleProduction: vi.fn(), setMusic: vi.fn(), exportMp3: vi.fn(), invalidatePreview: vi.fn(),
}) }))
vi.mock("@/features/production/move-part-position-dialog", () => ({ MovePartPositionDialog: () => null }))
vi.mock("@/features/production/cast-manager-sheet", () => ({
  CastManagerSheet: () => null,
  CastManagerContent: ({ onChanged }: { onChanged: () => Promise<void> }) => <button onClick={() => void onChanged().catch(() => undefined)}>Refresh Cast</button>,
}))
vi.mock("@/features/production/production-editor-canvas", () => ({
  ProductionEditorCanvas: ({ cast, onCastOpen, stageContent }: { cast: Array<{ name: string }>; onCastOpen: (open: boolean) => void; stageContent: ReactNode }) => <div><span data-testid="cast-names">{cast.map((item) => item.name).join(",")}</span><button onClick={() => onCastOpen(true)}>Open Cast</button>{stageContent}</div>,
}))

import { ProductionPage } from "./production-page"

afterEach(() => vi.clearAllMocks())

describe("ProductionPage partial Cast failure", () => {
  it("keeps the last Cast visible and exposes a scoped retry when refresh fails", async () => {
    api.productionCast.mockResolvedValueOnce([{ id: "role-1", name: "Narrator" }])
    const props = {
      production: { id: 7, public_id: "production-7", title: "Production", parts: [] },
      tree: [], music: {}, assets: [], assetCollections: [], config: null, directory: {},
      refresh: vi.fn().mockResolvedValue(undefined), refreshAssets: vi.fn().mockResolvedValue(undefined),
    } as unknown as ComponentProps<typeof ProductionPage>
    render(<ProductionPage {...props} />)
    await waitFor(() => expect(screen.getByTestId("cast-names").textContent).toBe("Narrator"))
    fireEvent.click(screen.getByRole("button", { name: "Open Cast" }))

    api.productionCast.mockRejectedValueOnce(new Error("cast offline"))
    fireEvent.click(screen.getByRole("button", { name: "Refresh Cast" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("cast offline"))
    expect(screen.getByTestId("cast-names").textContent).toBe("Narrator")
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
  })
})
