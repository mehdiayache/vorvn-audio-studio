// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import type { GeneratePayload, MusicBed, Production, ProductionPart, VoiceDirectory } from "@/types/domain"
import { useProductionActions } from "./use-production-actions"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, studioApi: { ...actual.studioApi, regenerate: vi.fn() } }
})

const payload: GeneratePayload = {
  text: "In the beginning", production_id: 28, insert_at: null,
  voice: "serinity", engine: "omni", model: "plus", format: "mp3",
  language: "English", instruction: "", speech_mode: "exact",
  rate: 1, pitch: 1, volume: 50, seed: 0,
}
const production = { id: 28, name: "Genesis", parts: [] } as unknown as Production
const part = { id: 127, position: 0, kind: "audio" } as ProductionPart
const directory = { config: null, cloned: [], meta: {}, catalog: [] } satisfies VoiceDirectory
const music = { filename: "" } as MusicBed

describe("useProductionActions render completion", () => {
  beforeEach(() => vi.clearAllMocks())

  it("keeps a paid take successful when the follow-up timeline refresh fails", async () => {
    vi.mocked(studioApi.regenerate).mockResolvedValue({ id: 127, name: "legacy take.mp3", cost: 0.0169 })
    const refresh = vi.fn().mockRejectedValue(new Error("refresh offline"))
    const toggleSource = vi.fn().mockResolvedValue(undefined)
    const closeTool = vi.fn()
    const player = {
      source: null, state: "idle", currentTime: 0, duration: 0, volume: 1, speed: 1,
      toggleSource, toggle: vi.fn(), pause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
    }
    const { result } = renderHook(() => useProductionActions({
      production, music, directory, player: player as never,
      refresh, refreshAssets: vi.fn(), closeTool,
    }))

    let rendered
    await act(async () => { rendered = await result.current.regeneratePart(part, payload) })

    expect(rendered).toMatchObject({ id: 127, url: "/audio/legacy%20take.mp3" })
    expect(toggleSource).toHaveBeenCalledWith(expect.objectContaining({ url: "/audio/legacy%20take.mp3" }))
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/audio created.*timeline/i))
    expect(toast.error).not.toHaveBeenCalled()
  })
})
