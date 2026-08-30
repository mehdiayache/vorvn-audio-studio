// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueChange, onValueCommit }: {
    "aria-label"?: string
    onValueChange?: (value: number[]) => void
    onValueCommit?: (value: number[]) => void
  }) => <button type="button" aria-label={label} onClick={() => {
    const value = label?.toLowerCase().includes("volume") ? 50 : label === "Echo delay" ? 440 : label === "Echo feedback" ? 60 : 75
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
      context={null} saving={false} onVolume={vi.fn()} onEffects={vi.fn()}
    />)
    expect(container.querySelector(".selection-bar")).toBeNull()

    rerender(<SoundSceneContextToolbar
      context={{ kind: "audio", mediaKind: "sfx", label: "Night bed", muted: false, lockState: "unlocked", gain: .2, effects: [] }}
      saving={false} onVolume={vi.fn()} onEffects={vi.fn()}
      onLock={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
    />)
    expect(container.querySelector(".selection-bar")).toBeTruthy()
    expect(container.querySelector(".selection-bar-group.is-mix")).toBeTruthy()
    expect(container.querySelector(".selection-bar-group.is-object")).toBeTruthy()
    expect(container.querySelector(".selection-bar-identity .lucide-audio-waveform")).toBeTruthy()
    expect(screen.getByText("Night bed")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Clip volume · 20%" }).textContent).toBe("20%")
    expect(screen.queryByRole("button", { name: "Mute audio clip" })).toBeNull()
    expect(screen.getByRole("button", { name: "Duplicate selected clips" }).textContent).toBe("")
  })

  it("creates a bounded Telephone descriptor from the contextual Effects control", () => {
    const onEffects = vi.fn()
    const onEffectsPreview = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [] }}
      saving={false} onVolume={vi.fn()} onEffectsPreview={onEffectsPreview} onEffects={onEffects}
    />)

    fireEvent.click(screen.getByRole("button", { name: /Effects/ }))
    const telephone = screen.getByRole("button", { name: "Telephone effect · Inactive" })
    expect(telephone.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(telephone)

    expect(onEffectsPreview).toHaveBeenCalledWith([expect.objectContaining({ type: "telephone", enabled: true })])
    expect(onEffects).toHaveBeenCalledWith([expect.objectContaining({ type: "telephone", enabled: true })])
    expect(screen.getByRole("button", { name: "Telephone effect · Active" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("keeps Sequence volume and mute in one coherent control", () => {
    const onVolume = vi.fn()
    const { container } = render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [] }}
      saving={false} onVolume={onVolume} onEffects={vi.fn()}
    />)

    expect(container.querySelector(".selection-bar-group.is-mix")).toBeTruthy()
    expect(container.querySelector(".selection-bar-group.is-object")).toBeNull()
    expect(container.querySelector(".selection-bar-identity .lucide-mic-vocal")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Part volume · 100%" }))
    fireEvent.click(screen.getByRole("button", { name: "Mute Part volume" }))
    expect(onVolume).toHaveBeenCalledWith({ gain: 1, muted: true }, false)
  })

  it("reacts to mute and zero-volume state without a second control", () => {
    const props = { saving: false, onVolume: vi.fn(), onEffects: vi.fn() }
    const { rerender } = render(<SoundSceneContextToolbar {...props}
      context={{ kind: "audio", label: "Rain", muted: false, gain: 1, effects: [] }}
    />)

    expect(screen.getByRole("button", { name: "Clip volume · 100%" })).toBeTruthy()
    rerender(<SoundSceneContextToolbar {...props}
      context={{ kind: "audio", label: "Rain", muted: true, gain: 1, effects: [] }}
    />)
    expect(screen.getByRole("button", { name: "Clip volume · 0%" }).className).toContain("is-muted")
    rerender(<SoundSceneContextToolbar {...props}
      context={{ kind: "audio", label: "Rain", muted: false, gain: 0, effects: [] }}
    />)
    expect(screen.getByRole("button", { name: "Clip volume · 0%" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Mute audio clip/ })).toBeNull()
  })

  it("uses the protected lock state in the Selection bar", () => {
    render(<SoundSceneContextToolbar
      context={{ kind: "audio", label: "Rain", muted: false, lockState: "locked", gain: 1, effects: [] }}
      saving={false} onVolume={vi.fn()} onEffects={vi.fn()} onLock={vi.fn()} onDelete={vi.fn()}
    />)

    const unlock = screen.getByRole("button", { name: "Unlock" })
    expect(unlock.className).toContain("is-locked")
    expect(unlock.querySelector(".lucide-lock")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Delete selected clips" }).hasAttribute("disabled")).toBe(true)
  })

  it("previews and commits one clip volume as a percentage mix", () => {
    const onVolumePreview = vi.fn()
    const onVolume = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "audio", label: "Night bed", muted: false, gain: .25, effects: [] }}
      saving={false} onVolumePreview={onVolumePreview} onVolume={onVolume} onEffects={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Clip volume · 25%" }))
    fireEvent.click(screen.getByRole("button", { name: "Clip volume" }))

    expect(onVolumePreview).toHaveBeenCalledWith({ gain: .5, muted: false }, false)
    expect(onVolume).toHaveBeenCalledWith({ gain: .5, muted: false }, false)
  })

  it("describes a mixed selection as a relative percentage adjustment", () => {
    render(<SoundSceneContextToolbar
      context={{ kind: "audio", label: "Audio selection", count: 2, muted: false, gain: .25, gainMixed: true, effects: [] }}
      saving={false} onVolume={vi.fn()} onEffects={vi.fn()}
    />)

    fireEvent.click(screen.getByRole("button", { name: "Selection volume · Mixed" }))
    expect(screen.getByText("Selection volume change")).toBeTruthy()
    expect(screen.getByText("100%")).toBeTruthy()
  })

  it("shows and commits the actual serial effect order", () => {
    const onEffects = vi.fn()
    render(<SoundSceneContextToolbar
      context={{ kind: "sequence", label: "Narrator", muted: false, gain: 1, effects: [
        { id: "2bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "telephone", enabled: true },
        { id: "3bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "echo", enabled: true, delay_ms: 180, feedback: .28, mix: .22 },
      ] }}
      saving={false} onVolume={vi.fn()} onEffects={onEffects}
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
      saving={false} onVolume={vi.fn()}
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
