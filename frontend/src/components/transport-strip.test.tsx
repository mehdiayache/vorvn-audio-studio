// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TransportStripView, type TransportStripViewProps } from "@/components/transport-strip"
import type { PlayerSource } from "@/types/domain"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

afterEach(cleanup)

const source: PlayerSource = { key: "take:1", url: "/audio/take.mp3", title: "Narrator take", subtitle: "Eve · exact route", kind: "take" }
const props: TransportStripViewProps = {
  source,
  state: "paused",
  currentTime: 12,
  duration: 90,
  volume: .8,
  speed: 1,
  onToggle: vi.fn(),
  onSeek: vi.fn(),
  onVolume: vi.fn(),
  onSpeed: vi.fn(),
  onClose: vi.fn(),
}

describe("TransportStrip", () => {
  it("renders nothing without an audio source", () => {
    const { container } = render(<TransportStripView {...props} source={null} state="idle" />)
    expect(container.innerHTML).toBe("")
  })

  it("owns the shared playback controls", () => {
    render(<TransportStripView {...props} />)
    expect(screen.getByRole("region", { name: "Audio player" }).getAttribute("data-source-kind")).toBe("take")
    expect(screen.getByText("Recording")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play Narrator take" }))
    expect(props.onToggle).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Playback speed 1.00 times" }))
    expect(props.onSpeed).toHaveBeenCalledWith(1.25)
    expect(screen.getByRole("link", { name: "Download Narrator take" }).getAttribute("href")).toBe("/audio/take.mp3")
  })

  it("labels every supported product source without page-specific players", () => {
    const kinds: Array<[PlayerSource["kind"], string]> = [
      ["production", "Production preview"], ["voice", "Voice preview"], ["asset", "Venture audio"],
      ["music", "Music"], ["subtitle", "Subtitle source"], ["batch", "Batch result"], ["standalone", "Standalone recording"],
    ]
    const { rerender } = render(<TransportStripView {...props} source={{ ...source, kind: "production" }} />)
    for (const [kind, label] of kinds) {
      rerender(<TransportStripView {...props} source={{ ...source, kind }} />)
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it("does not offer the temporary production preview as a download", () => {
    render(<TransportStripView {...props} source={{ ...source, kind: "production" }} />)
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull()
  })

  it("keeps errors in the persistent player surface", () => {
    render(<TransportStripView {...props} state="error" />)
    expect(screen.getByRole("alert").textContent).toContain("This audio could not be played")
  })
})
