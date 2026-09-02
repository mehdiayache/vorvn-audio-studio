// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ projectEditor: vi.fn(), soundScene: vi.fn(), visualScene: vi.fn() }))
vi.mock("@/lib/api", () => ({ originsApi: api }))

import { useProject } from "./use-project"

afterEach(() => vi.clearAllMocks())

describe("useProject partial refreshes", () => {
  it("preserves the last Project scenes when their independent refreshes fail", async () => {
    const project = { id: 7, title: "Project", parts: [] }
    const soundScene = { project_id: 7, revision: 1, document: { version: 1, tracks: [] } }
    const visualScene = { project_id: 7, revision: 1, document: { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [] }, updated_at: "2026-08-27" }
    api.projectEditor.mockResolvedValue(project)
    api.soundScene.mockResolvedValueOnce(soundScene)
    api.visualScene.mockResolvedValueOnce(visualScene)
    const { result } = renderHook(() => useProject(7))
    await waitFor(() => expect(result.current.soundScene.status).toBe("ready"))

    api.projectEditor.mockRejectedValueOnce(new Error("project offline"))
    api.soundScene.mockRejectedValueOnce(new Error("scene offline"))
    api.visualScene.mockRejectedValueOnce(new Error("visual offline"))
    await act(async () => { await result.current.refresh() })

    expect(result.current.project).toMatchObject({ status: "error", data: project, error: "project offline" })
    expect(result.current.soundScene).toMatchObject({ status: "error", data: soundScene, error: "scene offline" })
    expect(result.current.visualScene).toMatchObject({ status: "error", data: visualScene, error: "visual offline" })
  })
})
