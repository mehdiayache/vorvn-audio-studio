// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./timeline-canvas-waveform", () => ({
  TimelineCanvasWaveform: () => <span data-testid="waveform" />,
}))

import type { SequenceProjectionSpan } from "@/types/domain"
import { SequenceTimelineClip } from "./sequence-timeline-clip"

const span: SequenceProjectionSpan = {
  part_id: 7,
  part_public_id: "part-7",
  position: 0,
  kind: "speech",
  title: "Opening",
  role: "EE ENGLISH",
  voice_name: "Owned voice",
  filename: "speech.mp3",
  start_ms: 0,
  duration_ms: 10_000,
  silence: false,
  missing: false,
  mix: { muted: false, gain: .5, fade_in_ms: 0, fade_out_ms: 0, effects: [] },
}

afterEach(cleanup)

describe("SequenceTimelineClip", () => {
  it("presents Speech identity, volume and direct mix handles in the Timeline", () => {
    const onSelect = vi.fn()
    const { container } = render(<SequenceTimelineClip
      span={span}
      selected
      saving={false}
      pixelsPerSecond={20}
      style={{ left: 0, width: 200 }}
      onSelect={onSelect}
      onPreview={vi.fn()}
      onCommit={vi.fn()}
    />)

    expect(screen.getByRole("button", { name: "Speech Part 01 · EE ENGLISH · 50%" })).toBeTruthy()
    expect(container.querySelector(".lucide-mic-vocal")).toBeTruthy()
    expect(screen.getByText("50%")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Speech fade in" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Speech fade out" })).toBeTruthy()
    expect(container.querySelector(".sound-gain-line")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Speech Part 01 · EE ENGLISH · 50%" }))
    expect(onSelect).toHaveBeenCalled()
  })

  it("previews and commits a direct Speech fade gesture", () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    render(<SequenceTimelineClip
      span={span}
      selected
      saving={false}
      pixelsPerSecond={20}
      style={{ left: 0, width: 200 }}
      onSelect={vi.fn()}
      onPreview={onPreview}
      onCommit={onCommit}
    />)

    const handle = screen.getByRole("button", { name: "Speech fade in" })
    const clip = screen.getByRole("button", { name: "Speech Part 01 · EE ENGLISH · 50%" })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(clip, { pointerId: 1, clientX: 30, clientY: 10 })
    fireEvent.pointerUp(clip, { pointerId: 1, clientX: 30, clientY: 10 })

    expect(onPreview).toHaveBeenCalledWith({ fade_in_ms: 1_000 })
    expect(onCommit).toHaveBeenCalledWith({ fade_in_ms: 1_000 })
  })
})
