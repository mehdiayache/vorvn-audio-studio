// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/speech-part-card", () => ({
  SpeechPartCard: ({ part, onOpenCaptions }: { part: { id: number }; onOpenCaptions: () => void }) => <button onClick={onOpenCaptions}>Open captions for {part.id}</button>,
}))

import { SequenceWorkspace } from "./sequence-workspace"
import { TooltipProvider } from "./ui/tooltip"
import type { ProductionPart } from "@/types/domain"

afterEach(cleanup)

describe("SequenceWorkspace caption target", () => {
  it("keeps caption opening separate from the full Part inspector", () => {
    const part = { id: 12, public_id: "part-12", created_at: "2026-08-14", position: 0, kind: "speech", text: "A real recorded line.", clip_id: 20, cost: 0 } as ProductionPart
    const onOpenCaptions = vi.fn()

    render(<TooltipProvider><SequenceWorkspace
      parts={[part]}
      liveJobs={{}}
      playerPlaying={false}
      directory={{} as never}
      onInsert={vi.fn()}
      onRetryJob={vi.fn()}
      onConfirmJob={vi.fn()}
      onReplaceAsset={vi.fn()}
      onOpenCaptions={onOpenCaptions}
      actions={{} as never}
    /></TooltipProvider>)

    fireEvent.click(screen.getByRole("button", { name: "Open captions for 12" }))
    expect(onOpenCaptions).toHaveBeenCalledWith(part)
  })
})
