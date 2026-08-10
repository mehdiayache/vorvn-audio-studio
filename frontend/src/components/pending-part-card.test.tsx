// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { RenderTask, VoiceDirectory } from "@/types/domain"
import { PendingPartCard } from "./pending-part-card"

afterEach(cleanup)

const directory: VoiceDirectory = { config: null, cloned: [], meta: { Tina: { name: "Tina" } }, catalog: [], usage: {} }
const task: RenderTask = { id: "render-1", mode: "new", status: "generating", text: "In the beginning", voice: "Tina", insertAt: 0, startedAt: Date.now(), payload: { text: "In the beginning", production_id: 28, insert_at: 0, voice: "Tina", engine: "omni", model: "plus", format: "mp3", language: "English", instruction: "", speech_mode: "exact", rate: 1, pitch: 1, volume: 50, seed: 0 } }

describe("PendingPartCard", () => {
  it("shows generation feedback in the sequence", () => {
    render(<PendingPartCard task={task} index={0} directory={directory} onRetry={() => undefined} onDismiss={() => undefined} />)
    expect(screen.getByLabelText("Speech is generating")).toBeTruthy()
    expect(screen.getByText("Generating audio…")).toBeTruthy()
    expect(screen.getByText("Qwen Omni · Plus · English")).toBeTruthy()
    expect(screen.getByText("In the beginning")).toBeTruthy()
  })

  it("keeps a failed task actionable", () => {
    const retry = vi.fn(); const dismiss = vi.fn()
    render(<PendingPartCard task={{ ...task, status: "failed", error: "Provider timeout" }} index={0} directory={directory} onRetry={retry} onDismiss={dismiss} />)
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    fireEvent.click(screen.getByRole("button", { name: "Dismiss failed generation" }))
    expect(retry).toHaveBeenCalled(); expect(dismiss).toHaveBeenCalledWith("render-1")
  })
})
