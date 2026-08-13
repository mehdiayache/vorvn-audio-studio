// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SpeechPartCard } from "./speech-part-card"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ProductionPart, VoiceDirectory } from "@/types/domain"

afterEach(cleanup)

const directory = {
  config: { capabilities: { audio: { operator_title: "Expressive + tags", label: "Audio", models: { flash: "qwen-audio-3.0-tts-flash" } } } },
  cloned: [], meta: {}, catalog: [], usage: {},
} as unknown as VoiceDirectory

const longText = Array.from({ length: 18 }, (_, index) => `Sentence ${index + 1} remains fully authored and visible to assistive technology.`).join(" ")

function part(values: Partial<ProductionPart> = {}): ProductionPart {
  return {
    id: 7, created_at: "2026-08-13T10:00:00Z", position: 0, kind: "speech",
    text: longText, selected_take_id: 21, selected_take_number: 2,
    selected_take_text_state: "tagged", voice_name: "Maya", voice: "maya-provider-id",
    engine: "audio", tier: "flash", model: "qwen-audio-3.0-tts-flash",
    capability_name: "Expressive + tags", language: "English", duration_ms: 5100,
    filename: "maya.mp3", cost: .01, spent: .02, takes: 1,
    ...values,
  }
}

function actions() {
  return {
    play: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), move: vi.fn(),
    moveToPosition: vi.fn(), editSilence: vi.fn(), openPart: vi.fn(),
  }
}

function renderCard(component: ReactNode) {
  return render(<TooltipProvider>{component}</TooltipProvider>)
}

describe("SpeechPartCard", () => {
  it("keeps the complete long script in the DOM and expands the four-line presentation", () => {
    renderCard(<SpeechPartCard part={part()} job={null} index={0} count={1} selected={false} playing={false} directory={directory} onSelect={vi.fn()} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actions()} />)
    const script = screen.getByText(longText)
    expect(script.textContent).toBe(longText)
    expect(script.className).not.toContain("is-expanded")
    fireEvent.click(screen.getByRole("button", { name: /show more/i }))
    expect(script.className).toContain("is-expanded")
    expect(screen.getByRole("button", { name: /show less/i })).toBeTruthy()
  })

  it("keeps Voice, exact method, Take, captions and spend visible during generation", () => {
    renderCard(<SpeechPartCard part={part()} job={{ id: "speech-1", type: "speech", status: "running", progress: 68, detail: "Generating", retries: 0, result: {} }} captionJob={{ id: "cc-1", type: "transcribe", status: "running", progress: .2, detail: "Listening", retries: 0, result: {} }} index={0} count={1} selected playing={false} directory={directory} onSelect={vi.fn()} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actions()} />)
    expect(screen.getByText("Maya")).toBeTruthy()
    expect(screen.getByText("Qwen Audio · Flash · Expressive + tags · English")).toBeTruthy()
    expect(screen.getByText(/Take 2 selected · 0:05.1 · 2 Takes · Tagged input/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /CC Creating/ })).toBeTruthy()
    expect(screen.getByText("$0.02 spent")).toBeTruthy()
    expect(screen.getByText("TAKE 3 · GENERATING 68%")).toBeTruthy()
  })

  it("gives drafts their own truthful actions and zero-duration state", () => {
    const actionSet = actions()
    renderCard(<SpeechPartCard part={part({ kind: "draft", selected_take_id: null, filename: "", duration_ms: 9000, takes: 0 })} job={null} index={0} count={1} selected={false} playing={false} directory={directory} onSelect={vi.fn()} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actionSet} />)
    expect(screen.getByText("Not recorded · 0:00")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continue writing" }))
    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    expect(actionSet.openPart).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("button", { name: /play part/i })).toBeNull()
  })

  it("routes Take, caption and New Take actions to their explicit Production targets", () => {
    const actionSet = { ...actions(), newTake: vi.fn() }
    const sourcePart = part()
    renderCard(<SpeechPartCard part={sourcePart} job={null} index={0} count={1} selected={false} playing={false} directory={directory} onSelect={vi.fn()} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actionSet} />)

    fireEvent.click(screen.getByRole("button", { name: /Take 2 selected/ }))
    fireEvent.click(screen.getByRole("button", { name: /CC —/ }))
    fireEvent.click(screen.getByRole("button", { name: /New Take/ }))

    expect(actionSet.openPart).toHaveBeenNthCalledWith(1, sourcePart, "takes")
    expect(actionSet.openPart).toHaveBeenNthCalledWith(2, sourcePart, "captions")
    expect(actionSet.newTake).toHaveBeenCalledWith(sourcePart)
  })
})
