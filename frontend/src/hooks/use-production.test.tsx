// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ production: vi.fn(), projects: vi.fn(), music: vi.fn() }))
vi.mock("@/lib/api", () => ({ studioApi: api }))

import { useProduction } from "./use-production"

afterEach(() => vi.clearAllMocks())

describe("useProduction partial refreshes", () => {
  it("preserves the last tree and music when their independent refreshes fail", async () => {
    const production = { id: 7, title: "Production", parts: [] }
    const tree = [{ id: 1, type: "project", title: "Project" }]
    const music = { filename: "bed.mp3", volume: 0.2 }
    api.production.mockResolvedValue(production)
    api.projects.mockResolvedValueOnce(tree)
    api.music.mockResolvedValueOnce(music)
    const { result } = renderHook(() => useProduction(7))
    await waitFor(() => expect(result.current.music.status).toBe("ready"))

    api.projects.mockRejectedValueOnce(new Error("tree offline"))
    api.music.mockRejectedValueOnce(new Error("music offline"))
    await act(async () => { await result.current.refresh() })

    expect(result.current.tree).toMatchObject({ status: "error", data: tree, error: "tree offline" })
    expect(result.current.music).toMatchObject({ status: "error", data: music, error: "music offline" })
  })
})
