// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SequenceActions } from "./sequence-actions"
import { SequenceSilenceCard } from "./sequence-silence-card"
import type { ProductionPart } from "@/types/domain"

afterEach(cleanup)

describe("Sequence Silence Part", () => {
  it("exposes the type-correct Part Workbench directly", () => {
    const part = { id: 7, kind: "silence", title: "1.4", duration_ms: 1400 } as ProductionPart
    const actions = { openPart: vi.fn(), editSilence: vi.fn() } as unknown as SequenceActions
    render(<SequenceSilenceCard part={part} index={6} count={7} selected={false} onSelect={vi.fn()} actions={actions} />)

    fireEvent.click(screen.getByRole("button", { name: "Open details for silence 7" }))
    expect(actions.openPart).toHaveBeenCalledWith(part)
  })
})
