// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { RenderTask } from "@/types/domain"
import { useRenderTasks } from "./use-render-tasks"

const task: RenderTask = { id: "task-1", mode: "new", status: "generating", text: "Hello", voice: "Tina", insertAt: null, startedAt: Date.now(), payload: { text: "Hello", production_id: 28, insert_at: null, voice: "Tina", engine: "omni", model: "plus", format: "mp3", language: "English", instruction: "", speech_mode: "exact", rate: 1, pitch: 1, volume: 50, seed: 0 } }

describe("useRenderTasks", () => {
  it("owns a pending task until the render resolves", async () => {
    let finish: (value: { id: number; url: string }) => void = () => undefined
    const executor = vi.fn(() => new Promise<{ id: number; url: string }>((resolve) => { finish = resolve }))
    const { result } = renderHook(() => useRenderTasks(executor))
    let pending!: Promise<unknown>
    act(() => { pending = result.current.enqueue(task) })
    expect(result.current.tasks).toHaveLength(1)
    await act(async () => { finish({ id: 127, url: "/audio/ready.mp3" }); await pending })
    expect(result.current.tasks).toHaveLength(0)
  })

  it("retains a failed task for retry", async () => {
    const executor = vi.fn(async () => { throw new Error("Provider timeout") })
    const { result } = renderHook(() => useRenderTasks(executor))
    await act(async () => { await result.current.enqueue(task).catch(() => undefined) })
    expect(result.current.tasks[0]).toMatchObject({ status: "failed", error: "Provider timeout" })
  })
})
