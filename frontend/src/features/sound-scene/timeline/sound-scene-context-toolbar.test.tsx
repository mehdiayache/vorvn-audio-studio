// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SoundSceneContextToolbar } from "./sound-scene-context-toolbar"

afterEach(cleanup)

describe("SoundSceneContextToolbar", () => {
  it("keeps its context region present before and after selection", () => {
    const { container, rerender } = render(<SoundSceneContextToolbar
      context={null} saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={vi.fn()}
    />)
    expect(container.querySelector(".sound-scene-context")).toBeTruthy()
    expect(screen.getByText("No selection")).toBeTruthy()

    rerender(<SoundSceneContextToolbar
      context={{ kind: "music", label: "Night bed", muted: false, locked: false, gain: .2, effects: [] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={vi.fn()}
      onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
    />)
    expect(container.querySelector(".sound-scene-context")).toBeTruthy()
    expect(screen.getByText("Night bed")).toBeTruthy()
  })

  it("creates a bounded Telephone descriptor from the contextual Effects control", () => {
    const onEffects = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={onEffects}
    />)

    fireEvent.click(screen.getByRole("button", { name: /Effects/ }))
    fireEvent.click(screen.getByRole("button", { name: /Telephone/ }))

    expect(onEffects).toHaveBeenCalledWith([expect.objectContaining({ type: "telephone", enabled: true })])
  })
})
