// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ attachDirectorAsset: vi.fn(), detachDirectorAsset: vi.fn() }))
vi.mock("@/lib/api", () => ({ studioApi: api }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

import { DirectorStage } from "../director/director-stage"
import { WORKSTATION_STAGES } from "../workstation-workflow"

describe("Production workflow", () => {
  it("presents the four accepted operator stages in order", () => {
    expect(WORKSTATION_STAGES.map(({ id, label, description }) => ({ id, label, description }))).toEqual([
      { id: "sequence", label: "Script", description: "Voice and story" },
      { id: "director", label: "Director", description: "Create and collect visuals" },
      { id: "sound", label: "Timeline", description: "Assemble the production" },
      { id: "mix", label: "Export", description: "Finish and deliver" },
    ])
  })

  it("starts Director as an intentional visual workspace instead of a fake tool", () => {
    render(<DirectorStage productionId={7} assets={[]} directorAssetIds={[]} onUpload={vi.fn()} onRefresh={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Create the visual world" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Create the visual world for this Production" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Upload visuals" })).toBeTruthy()
    expect(screen.queryByText(/AI|Generate/)).toBeNull()
  })

  it("adds a reusable visual to the Production without placing it on the Timeline", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    api.attachDirectorAsset.mockResolvedValue({ asset_id: 88, duplicate: false })
    render(<DirectorStage
      productionId={7}
      assets={[{ id: 88, media_type: "image", name: "Harbour dusk", filename: "harbour.webp", width: 1200, height: 800 }]}
      directorAssetIds={[]}
      onUpload={vi.fn()}
      onRefresh={refresh}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Visual Library" }))
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(api.attachDirectorAsset).toHaveBeenCalledWith(7, 88))
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole("button", { name: /Add to Timeline/ })).toBeNull()
  })
})
