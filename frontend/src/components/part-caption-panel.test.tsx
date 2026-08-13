// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ subtitleLayout: vi.fn() }))
vi.mock("@/lib/api", () => ({ studioApi: api }))

import { PartCaptionPanel } from "./part-caption-panel"

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false })
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined })
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined })
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("PartCaptionPanel durable review state", () => {
  it("never offers automatic retry for ambiguous review-required work", () => {
    render(<PartCaptionPanel
      captions={[]} transcript={null} languages={[]} loading={false} busy={null} confirmation={null}
      job={{ id: "ambiguous-1", type: "transcribe", status: "blocked", progress: 0, detail: "Review", retries: 0, result: { requires_review: true, ambiguous: true } as never }}
      onSelect={vi.fn()} onCreate={vi.fn()} onTranslate={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} onRetryJob={vi.fn()} onDismissJob={vi.fn()}
    />)
    expect(screen.getByText("Review required")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })

  it("restores free Standard, Short, and Word-by-word layouts inside Production", async () => {
    api.subtitleLayout.mockResolvedValue({
      profile: { key: "short", label: "Short", description: "", max_words: 5, max_chars: 32, line_chars: 32, max_lines: 1, min_duration_ms: 500, max_duration_ms: 2500 },
      cues: [{ start: 0, end: 900, text: "A short phrase", words: [], timing: "word" }],
      srt: "1\n00:00:00,000 --> 00:00:00,900\nA short phrase\n",
      vtt: "WEBVTT",
      timing_json: "[]",
      timing_quality: "word_aligned",
      metrics: { cues: 1, average_words: 3, maximum_cps: 14 },
    })
    render(<PartCaptionPanel
      captions={[{ id: 8, name: "part", language: "English", duration_ms: 900, is_translation: false, stale: false }]}
      transcript={{ id: 8, public_id: "caption-8", file: "part.mp3", url: "/audio/part.mp3", text: "A short phrase", srt: "", vtt: "", sentences: [], duration_ms: 900, language: "English", created_at: null, cost: 0, cost_basis: "actual", model: null, provider_region: null, price_version: null, catalog_rate: 0, source_job_id: null }}
      languages={["English", "Arabic"]} sourceLanguage="English" loading={false} busy={null} confirmation={null} job={null}
      onSelect={vi.fn()} onCreate={vi.fn()} onTranslate={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} onRetryJob={vi.fn()} onDismissJob={vi.fn()}
    />)
    expect(screen.getByRole("button", { name: /Standard/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Short/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Word by word/ })).toBeTruthy()
    await waitFor(() => expect(api.subtitleLayout).toHaveBeenCalledWith(8, "standard"))
    await waitFor(() => expect(screen.getByRole("button", { name: /Short/ }).hasAttribute("disabled")).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: /Short/ }))
    await waitFor(() => expect(api.subtitleLayout).toHaveBeenCalledWith(8, "short"))
    expect(await screen.findByText("A short phrase")).toBeTruthy()
  })

  it("lets the operator supply a known caption language without rewriting the Take", () => {
    const onCreate = vi.fn()
    render(<PartCaptionPanel
      captions={[]} transcript={null} languages={["English", "Arabic"]} loading={false} busy={null} confirmation={null} job={null}
      onSelect={vi.fn()} onCreate={onCreate} onTranslate={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} onRetryJob={vi.fn()} onDismissJob={vi.fn()}
    />)
    const sourceLanguage = screen.getByRole("combobox", { name: "Caption source language" })
    sourceLanguage.focus()
    fireEvent.keyDown(sourceLanguage, { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("option", { name: "English" }))
    fireEvent.click(screen.getByRole("button", { name: "Create subtitles" }))
    expect(onCreate).toHaveBeenCalledWith("English")
  })
})
