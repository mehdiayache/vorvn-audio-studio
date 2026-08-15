// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpeechPartCard } from "./speech-part-card"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ProductionPart, VoiceDirectory } from "@/types/domain"

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return this.classList.contains("speech-part-script-copy") && (this.textContent?.length ?? 0) > 260 ? 120 : 40 },
  })
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() { return this.classList.contains("speech-part-script-copy") ? 60 : 40 },
  })
})

afterEach(() => {
  cleanup()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
})

const directory = {
  config: { capabilities: { audio: { operator_title: "Expressive + tags", label: "Audio", models: { flash: "qwen-audio-3.0-tts-flash" } } } },
  cloned: [], meta: {}, catalog: [], usage: {},
  identities: [{ id: "voice-maya", name: "Maya", metadata: { gender: "female" }, usage: {} }],
} as unknown as VoiceDirectory

const longText = Array.from({ length: 18 }, (_, index) => `Sentence ${index + 1} remains fully authored and visible to assistive technology.`).join(" ")

function part(values: Partial<ProductionPart> = {}): ProductionPart {
  return {
    id: 7, created_at: "2026-08-13T10:00:00Z", position: 0, kind: "speech",
    text: longText, clip_id: 21,
    recording_text_state: "tagged", voice_identity_id: "voice-maya", voice_name: "Maya", voice: "maya-provider-id",
    engine: "audio", tier: "flash", model: "qwen-audio-3.0-tts-flash",
    capability_name: "Expressive + tags", language: "English", duration_ms: 5100,
    filename: "maya.mp3", cost: .01, spent: .02,
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
  it("keeps the complete long script in the DOM and expands only rendered overflow", () => {
    renderCard(<SpeechPartCard part={part()} job={null} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actions()} />)
    const script = screen.getByText(longText)
    expect(script.textContent).toBe(longText)
    expect(script.className).not.toContain("is-expanded")
    fireEvent.click(screen.getByRole("button", { name: /show more/i }))
    expect(script.className).toContain("is-expanded")
    expect(screen.getByRole("button", { name: /show less/i })).toBeTruthy()
  })

  it("does not offer expansion when the rendered script fits", () => {
    const shortText = "One compact authored line."
    renderCard(<SpeechPartCard part={part({ text: shortText })} job={null} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actions()} />)
    expect(screen.getByText(shortText).textContent).toBe(shortText)
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull()
  })

  it("keeps Voice, factual gender, exact method, duration, captions and spend visible during generation", () => {
    renderCard(<SpeechPartCard part={part()} job={{ id: "speech-1", type: "speech", status: "running", progress: 68, detail: "Generating", retries: 0, result: {} }} captionJob={{ id: "cc-1", type: "transcribe", status: "running", progress: .2, detail: "Listening", retries: 0, result: {} }} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actions()} />)
    expect(screen.getByText("Maya")).toBeTruthy()
    expect(screen.getByText("Female")).toBeTruthy()
    expect(screen.getByText("Qwen Audio · Flash · Expressive + tags · EN")).toBeTruthy()
    expect(screen.getByText("0:05.1")).toBeTruthy()
    expect(screen.queryByText("Recording")).toBeNull()
    expect(screen.queryByText("Tagged")).toBeNull()
    expect(screen.getByRole("button", { name: /Captions: Creating captions/ })).toBeTruthy()
    expect(screen.getByText("$0.02")).toBeTruthy()
    expect(screen.getByText("RECORDING · GENERATING 68%")).toBeTruthy()
  })

  it("keeps the result lane focused and does not offer recording replacement", () => {
    const { container } = renderCard(<SpeechPartCard part={part()} job={null} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={{ ...actions(), recordPart: vi.fn() }} />)
    const footer = container.querySelector(".speech-part-result")
    expect(footer?.contains(screen.getByRole("button", { name: /play part/i }))).toBe(true)
    expect(screen.queryByRole("button", { name: /New Clip/i })).toBeNull()
    fireEvent.pointerDown(screen.getByRole("button", { name: "Part actions" }), { button: 0, ctrlKey: false })
    expect(screen.queryByRole("menuitem", { name: /Replace recording/i })).toBeNull()
    expect(container.querySelector(".speech-operation-lane")).toBeNull()
    expect(screen.queryByText("Direct voice")).toBeNull()
  })

  it("uses the same zero-padded Part label in the card and floating player source", () => {
    const actionSet = actions()
    renderCard(<SpeechPartCard part={part()} job={null} index={1} count={2} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actionSet} />)
    expect(screen.getByText("02")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play part" }))
    expect(actionSet.play).toHaveBeenCalledWith(expect.objectContaining({ title: "Part 02" }))
  })

  it("gives drafts their own truthful actions and zero-duration state", () => {
    const actionSet = actions()
    renderCard(<SpeechPartCard part={part({ kind: "draft", clip_id: null, filename: "", duration_ms: 9000 })} job={null} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={actionSet} />)
    expect(screen.getByText("Not recorded")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }))
    fireEvent.click(screen.getByRole("button", { name: "Record" }))
    expect(actionSet.openPart).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("button", { name: /play part/i })).toBeNull()
  })

  it("routes captions to the explicit Production target without a replacement action", () => {
    const actionSet = { ...actions(), recordPart: vi.fn() }
    const onOpenCaptions = vi.fn()
    const sourcePart = part()
    renderCard(<SpeechPartCard part={sourcePart} job={null} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} onOpenCaptions={onOpenCaptions} actions={actionSet} />)

    fireEvent.click(screen.getByRole("button", { name: /Captions: No captions/ }))

    expect(onOpenCaptions).toHaveBeenCalledOnce()
    expect(actionSet.openPart).not.toHaveBeenCalled()
    expect(actionSet.recordPart).not.toHaveBeenCalled()
  })

  it("toggles durable output inclusion without deleting the recording", () => {
    const setEnabled = vi.fn()
    const sourcePart = part({ enabled: false })
    renderCard(<SpeechPartCard part={sourcePart} job={null} index={0} count={1} playing={false} directory={directory} onRetryJob={vi.fn()} onConfirmJob={vi.fn()} actions={{ ...actions(), setEnabled }} />)

    fireEvent.click(screen.getByRole("button", { name: "Include part 1 in output" }))
    expect(setEnabled).toHaveBeenCalledWith(sourcePart, true)
    expect(screen.getByText(longText)).toBeTruthy()
  })
})
