// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueChange, onValueCommit, disabled }: {
    "aria-label"?: string
    onValueChange?: (value: number[]) => void
    onValueCommit?: (value: number[]) => void
    disabled?: boolean
  }) => {
    const value = label === "Sequence Part gain" ? -6
      : label === "Sequence Part fade in" ? 1.2
        : label === "Echo delay" ? 440
          : label === "Echo feedback" ? 60
            : label === "Echo mix" ? 75 : 1.8
    return <button type="button" aria-label={label} disabled={disabled} onClick={() => {
      onValueChange?.([value]); onValueCommit?.([value])
    }} />
  },
}))

import { SequenceMixInspector } from "./sequence-mix-inspector"

afterEach(cleanup)

describe("SequenceMixInspector", () => {
  it("previews locally while committing one exact Sequence mix update", () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn().mockResolvedValue(undefined)
    render(<SequenceMixInspector
      span={{
        part_id: 7, part_public_id: "part-7", position: 0,
        kind: "speech", title: "Opening", role: "Narrator", voice_name: "Eva",
        filename: "opening.mp3", start_ms: 0, duration_ms: 10_000,
        silence: false, missing: false,
        mix: { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] },
      }}
      saving={false} onPreview={onPreview} onCommit={onCommit}
      onOpenSequence={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Sequence Part gain" }))

    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith({ gain: expect.closeTo(.501, 2) })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith({ gain: expect.closeTo(.501, 2) })
    expect(screen.getByRole("switch", { name: "Mute Part audio" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Open in Sequence/ })).toBeTruthy()
  })

  it("previews an Echo parameter locally and persists it once on release", () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn().mockResolvedValue(undefined)
    render(<SequenceMixInspector
      span={{
        part_id: 7, part_public_id: "part-7", position: 0,
        kind: "speech", title: "Opening", role: "Narrator", voice_name: "Eva",
        filename: "opening.mp3", start_ms: 0, duration_ms: 10_000,
        silence: false, missing: false,
        mix: { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [{
          id: "3bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "echo",
          enabled: true, delay_ms: 180, feedback: .28, mix: .22,
        }] },
      }}
      saving={false} onPreview={onPreview} onCommit={onCommit}
      onOpenSequence={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Echo mix" }))

    expect(onPreview).toHaveBeenCalledOnce()
    expect(onPreview).toHaveBeenCalledWith({
      effects: [expect.objectContaining({ type: "echo", mix: .75 })],
    })
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith({
      effects: [expect.objectContaining({ type: "echo", mix: .75 })],
    })
  })
})
