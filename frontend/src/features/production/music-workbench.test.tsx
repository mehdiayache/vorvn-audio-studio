// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({ "aria-label": label, onValueCommit, disabled }: { "aria-label"?: string; onValueCommit?: (value: number[]) => void; disabled?: boolean }) => {
    const value = label === "Music mix level" ? 24 : label === "Music source position" ? 5.5 : label === "Music fade in" ? 1.5 : 3.5
    return <button type="button" aria-label={label} disabled={disabled} onClick={() => onValueCommit?.([value])} />
  },
}))

import { MusicWorkbench } from "./music-workbench"

const music = { music_of: 9, filename: "bed.mp3", name: "Bed", duration_ms: 60_000, volume: .1, start: 0, fade_in: 2, fade_out: 4, duck: true }

afterEach(cleanup)

describe("MusicWorkbench", () => {
  it("commits exact mix values and keeps audition separate", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    const onPlay = vi.fn()
    render(<MusicWorkbench music={music} playing={false} onPlay={onPlay} onChange={onChange} onChoose={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Play music audition" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "asset-source:9", kind: "music" }))
    fireEvent.click(screen.getByRole("button", { name: "Music mix level" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ volume: .24 }))
    fireEvent.click(screen.getByRole("button", { name: "Music source position" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ start: 5.5 }))
  })

  it("keeps a failed save visible in the owning Workbench", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("Music settings are unavailable."))
    render(<MusicWorkbench music={music} playing={false} onPlay={vi.fn()} onChange={onChange} onChoose={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Music fade in" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Music settings are unavailable.")
  })

  it("does not project sequential Part language onto an empty Music lane", () => {
    render(<MusicWorkbench music={{}} playing={false} onPlay={vi.fn()} onChange={vi.fn()} onChoose={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/Music remains parallel to the Sequence/)).toBeTruthy()
    expect(screen.queryByText(/Take|Voice/)).toBeNull()
  })
})
