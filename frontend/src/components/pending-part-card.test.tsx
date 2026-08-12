// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { RenderTask, VoiceDirectory } from "@/types/domain"
import { PendingPartCard } from "./pending-part-card"

afterEach(cleanup)

const directory: VoiceDirectory = { config: null, cloned: [], meta: { Tina: { name: "Tina" } }, catalog: [], usage: {} }
const task: RenderTask = { id: "job-render-1", jobId: "job-render-1", mode: "new", status: "running", text: "In the beginning", voice: "Tina", insertAt: 0, startedAt: Date.now(), payload: { text: "In the beginning", production_id: 28, insert_at: 0, voice: "Tina", engine: "omni", model: "plus", format: "mp3", language: "English", instruction: "", speech_mode: "exact", rate: 1, pitch: 1, volume: 50, seed: 0 } }

describe("PendingPartCard", () => {
  it("shows generation feedback in the sequence", () => {
    render(<PendingPartCard task={task} index={0} directory={directory} onRetry={() => undefined} onConfirm={() => undefined} onDismiss={() => undefined} />)
    expect(screen.getByLabelText("Speech is generating")).toBeTruthy()
    expect(screen.getByText("Generating audio…")).toBeTruthy()
    expect(screen.getByText("Qwen 3.5 Omni · Plus")).toBeTruthy()
    expect(screen.getByText("English")).toBeTruthy()
    expect(screen.getByText("In the beginning")).toBeTruthy()
  })

  it("keeps a failed task actionable", () => {
    const retry = vi.fn(); const dismiss = vi.fn()
    render(<PendingPartCard task={{ ...task, status: "failed", error: "Provider timeout" }} index={0} directory={directory} onRetry={retry} onConfirm={() => undefined} onDismiss={dismiss} />)
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    fireEvent.click(screen.getByRole("button", { name: "Dismiss generation" }))
    expect(retry).toHaveBeenCalled(); expect(dismiss).toHaveBeenCalledWith("job-render-1")
  })

  it("distinguishes safe cost confirmation from an ambiguous provider review", () => {
    const confirm = vi.fn()
    const { rerender } = render(<PendingPartCard task={{ ...task, status: "blocked", needsConfirmation: true, estimate: .04 }} index={0} directory={directory} onRetry={() => undefined} onConfirm={confirm} onDismiss={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirm $0.0400" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-render-1" }))

    rerender(<PendingPartCard task={{ ...task, status: "blocked", requiresReview: true }} index={0} directory={directory} onRetry={() => undefined} onConfirm={confirm} onDismiss={() => undefined} />)
    expect(screen.getByText("Review required")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull()
  })
})
