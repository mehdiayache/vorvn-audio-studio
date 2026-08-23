// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueChange, onValueCommit }: {
    "aria-label"?: string
    onValueChange?: (value: number[]) => void
    onValueCommit?: (value: number[]) => void
  }) => <button type="button" aria-label={label} onClick={() => {
    const value = label?.includes("gain") ? -6 : label === "Echo delay" ? 440 : label === "Echo feedback" ? 60 : 75
    onValueChange?.([value]); onValueCommit?.([value])
  }} />,
}))

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
      context={{ kind: "audio", label: "Night bed", muted: false, lockState: "unlocked", gain: .2, effects: [] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={vi.fn()}
      onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
    />)
    expect(container.querySelector(".sound-scene-context")).toBeTruthy()
    expect(screen.getByText("Night bed")).toBeTruthy()
  })

  it("creates a bounded Telephone descriptor from the contextual Effects control", () => {
    const onEffects = vi.fn()
    const onEffectsPreview = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffectsPreview={onEffectsPreview} onEffects={onEffects}
    />)

    fireEvent.click(screen.getByRole("button", { name: /Effects/ }))
    fireEvent.click(screen.getByRole("button", { name: /Telephone/ }))

    expect(onEffectsPreview).toHaveBeenCalledWith([expect.objectContaining({ type: "telephone", enabled: true })])
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

  it("previews and commits one clip gain in dB", () => {
    const onGainPreview = vi.fn()
    const onGain = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "audio", label: "Night bed", muted: false, gain: .25, effects: [] }}
      saving={false} onMute={vi.fn()} onGainPreview={onGainPreview} onGain={onGain} onEffects={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Gain" }))
    fireEvent.click(screen.getByRole("button", { name: "Audio clip gain" }))

    expect(onGainPreview).toHaveBeenCalledWith(-6, false)
    expect(onGain).toHaveBeenCalledWith(-6, false)
  })

  it("describes a mixed selection as a relative dB adjustment", () => {
    render(<SoundSceneContextToolbar
      context={{ kind: "audio", label: "Audio selection", count: 2, muted: false, gain: .25, gainMixed: true, effects: [] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()} onEffects={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Gain" }))
    expect(screen.getByText("Relative gain")).toBeTruthy()
    expect(screen.getByText("0.0 dB")).toBeTruthy()
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

  it("previews Music Echo parameters during change and commits once on release", () => {
    const onEffectsPreview = vi.fn()
    const onEffects = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "audio", label: "Night bed", muted: false, gain: .2, effects: [{
        id: "3bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "echo",
        enabled: true, delay_ms: 180, feedback: .28, mix: .22,
      }] }}
      saving={false} onMute={vi.fn()} onGain={vi.fn()}
      onEffectsPreview={onEffectsPreview} onEffects={onEffects}
      onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: /Effects/ }))
    fireEvent.click(screen.getByRole("button", { name: "Echo mix" }))

    expect(onEffectsPreview).toHaveBeenCalledOnce()
    expect(onEffectsPreview).toHaveBeenCalledWith([
      expect.objectContaining({ type: "echo", mix: .75 }),
    ])
    expect(onEffects).toHaveBeenCalledOnce()
    expect(onEffects).toHaveBeenCalledWith([
      expect.objectContaining({ type: "echo", mix: .75 }),
    ])
  })
})
