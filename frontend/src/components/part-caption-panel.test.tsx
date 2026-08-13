// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PartCaptionPanel } from "./part-caption-panel"

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
})
