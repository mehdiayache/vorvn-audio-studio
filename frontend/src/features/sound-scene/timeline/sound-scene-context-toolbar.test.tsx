// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SoundSceneContextToolbar } from "./sound-scene-context-toolbar"

beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("SoundSceneContextToolbar", () => {
  it("shows contextual actions only while an object is selected", () => {
    const { container, rerender } = render(<SoundSceneContextToolbar
      context={null} saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={vi.fn()}
    />)
    expect(container.querySelector(".sound-scene-context")).toBeNull()

    rerender(<SoundSceneContextToolbar
      context={{ kind: "music", label: "Night bed", muted: false, lockState: "unlocked", gain: .2, effects: [] }}
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

  it("names Sequence mute as a mix-only audio action", () => {
    const onMute = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [] }}
      saving={false} onMute={onMute} onGain={vi.fn()} onEffects={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Mute Part audio" }))
    expect(onMute).toHaveBeenCalledOnce()
  })

  it("shows and commits the actual serial effect order", () => {
    const onEffects = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [
        { id: "2bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "telephone", enabled: true },
        { id: "3bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "echo", enabled: true, delay_ms: 180, feedback: .28, mix: .22 },
      ] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={onEffects}
    />)

    fireEvent.click(screen.getByRole("button", { name: /Effects/ }))
    expect(screen.getByLabelText("Effect processing order").textContent).toMatch(/1Telephone.*2Echo/)
    fireEvent.click(screen.getByRole("button", { name: "Move echo earlier in the effect chain" }))

    expect(onEffects).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: "echo" }),
      expect.objectContaining({ type: "telephone" }),
    ])
  })
})
