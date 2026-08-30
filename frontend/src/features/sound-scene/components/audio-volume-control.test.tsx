// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueChange, onValueCommit, disabled }: {
    "aria-label"?: string
    onValueChange?: (value: number[]) => void
    onValueCommit?: (value: number[]) => void
    disabled?: boolean
  }) => <>
    <button type="button" disabled={disabled} aria-label={`${label} set 0%`} onClick={() => { onValueChange?.([0]); onValueCommit?.([0]) }} />
    <button type="button" disabled={disabled} aria-label={`${label} set 150%`} onClick={() => { onValueChange?.([150]); onValueCommit?.([150]) }} />
  </>,
}))

import { AudioVolumeControl } from "./audio-volume-control"

afterEach(cleanup)

describe("AudioVolumeControl", () => {
  it("turns zero volume into mute without destroying the last non-zero volume", () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    render(<AudioVolumeControl label="Clip volume" gain={.65} muted={false} onPreview={onPreview} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole("button", { name: "Clip volume set 0%" }))

    expect(onPreview).toHaveBeenLastCalledWith({ gain: .65, muted: true })
    expect(onCommit).toHaveBeenLastCalledWith({ gain: .65, muted: true })
  })

  it("restores the remembered volume when unmuting", () => {
    const onCommit = vi.fn()
    render(<AudioVolumeControl label="Part volume" gain={.65} muted onCommit={onCommit} />)

    fireEvent.click(screen.getByRole("button", { name: "Unmute Part volume" }))

    expect(onCommit).toHaveBeenCalledWith({ gain: .65, muted: false })
  })

  it("repairs a legacy zero-gain state to 100% when unmuted", () => {
    const onCommit = vi.fn()
    render(<AudioVolumeControl label="Video volume" gain={0} muted={false} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole("button", { name: "Unmute Video volume" }))

    expect(onCommit).toHaveBeenCalledWith({ gain: 1, muted: false })
  })

  it("allows a clear creative boost up to 200%", () => {
    const onCommit = vi.fn()
    render(<AudioVolumeControl label="Track volume" gain={1} muted={false} onCommit={onCommit} />)

    fireEvent.click(screen.getByRole("button", { name: "Track volume set 150%" }))

    expect(onCommit).toHaveBeenCalledWith({ gain: 1.5, muted: false })
  })
})
