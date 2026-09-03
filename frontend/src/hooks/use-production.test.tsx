// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ productionEditor: vi.fn(), soundScene: vi.fn(), visualScene: vi.fn() }))
vi.mock("@/lib/api", () => ({ originsApi: api }))

import { useProduction } from "./use-production"

afterEach(() => vi.clearAllMocks())

describe("useProduction partial refreshes", () => {
  it("preserves the last Production scenes when their independent refreshes fail", async () => {
    const production = { id: 7, title: "Production", parts: [] }
    const soundScene = { production_id: 7, revision: 1, document: { version: 1, tracks: [] } }
    const visualScene = { production_id: 7, revision: 1, document: { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [] }, updated_at: "2026-08-27" }
    api.productionEditor.mockResolvedValue(production)
    api.soundScene.mockResolvedValueOnce(soundScene)
    api.visualScene.mockResolvedValueOnce(visualScene)
    const { result } = renderHook(() => useProduction(7))
    await waitFor(() => expect(result.current.soundScene.status).toBe("ready"))

    api.productionEditor.mockRejectedValueOnce(new Error("production offline"))
    api.soundScene.mockRejectedValueOnce(new Error("scene offline"))
    api.visualScene.mockRejectedValueOnce(new Error("visual offline"))
    await act(async () => { await result.current.refresh() })

    expect(result.current.production).toMatchObject({ status: "error", data: production, error: "production offline" })
    expect(result.current.soundScene).toMatchObject({ status: "error", data: soundScene, error: "scene offline" })
    expect(result.current.visualScene).toMatchObject({ status: "error", data: visualScene, error: "visual offline" })
  })
})
