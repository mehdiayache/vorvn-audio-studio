// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueCommit, disabled }: { "aria-label"?: string; onValueCommit?: (value: number[]) => void; disabled?: boolean }) => {
    const value = label === "Music mix level" ? 24 : label === "Music source position" ? 5.5 : label === "Music fade in" ? 1.5 : 3.5
    return <button type="button" aria-label={label} disabled={disabled} onClick={() => onValueCommit?.([value])} />
  },
}))

import { MusicBed } from "./music-bed"

const music = { music_of: 9, filename: "bed.mp3", name: "Bed", duration_ms: 60_000, volume: .1, start: 0, fade_in: 2, fade_out: 4, duck: true }

afterEach(cleanup)

describe("MusicBed", () => {
  it("commits the exact released value using the public API field names", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<MusicBed music={music} playing={false} onPlay={vi.fn()} onChange={onChange} onChoose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Music mix level" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ volume: .24 }))
    await waitFor(() => expect((screen.getByRole("button", { name: "Music source position" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Music source position" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ start: 5.5 }))
    await waitFor(() => expect((screen.getByRole("button", { name: "Music fade in" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Music fade in" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ fade_in: 1.5 }))
    await waitFor(() => expect((screen.getByRole("button", { name: "Music fade out" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Music fade out" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ fade_out: 3.5 }))
  })

  it("keeps a failed save visible in the owning surface", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("Music settings are unavailable."))
    render(<MusicBed music={music} playing={false} onPlay={vi.fn()} onChange={onChange} onChoose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Music fade in" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Music settings are unavailable.")
  })
})
