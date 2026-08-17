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
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined
Element.prototype.scrollIntoView = () => undefined

afterEach(cleanup)

const source: PlayerSource = { key: "clip:1", url: "/audio/clip.mp3", title: "Narrator clip", subtitle: "Eve · exact route", kind: "clip" }
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
    expect(screen.getByRole("region", { name: "Audio player" }).getAttribute("data-source-kind")).toBe("clip")
    expect(screen.getByText("Recording")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play Narrator clip" }))
    expect(props.onToggle).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Playback speed 1.00 times" }))
    expect(props.onSpeed).toHaveBeenCalledWith(1.25)
    expect(screen.getByRole("link", { name: "Download Narrator clip" }).getAttribute("href")).toBe("/audio/clip.mp3")
  })

  it("labels every supported product source without page-specific players", () => {
    const kinds: Array<[PlayerSource["kind"], string]> = [
      ["production", "Production preview"], ["voice", "Voice preview"], ["asset", "Venture audio"],
      ["music", "Music"], ["subtitle", "Subtitle source"], ["standalone", "Standalone recording"],
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

  it("toggles captions directly without opening an intermediary menu", () => {
    const onToggleCaptions = vi.fn()
    render(<TransportStripView {...props}
      captionTracks={[{ id: "en", language: "English", label: "English · Original", stale: false, cues: [] }]}
      captionTrack={{ id: "en", language: "English", label: "English · Original", stale: false, cues: [] }}
      onToggleCaptions={onToggleCaptions}
    />)
    fireEvent.click(screen.getByRole("button", { name: "Show captions" }))
    expect(onToggleCaptions).toHaveBeenCalledOnce()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("keeps the caption control visible but muted when no caption track exists", () => {
    render(<TransportStripView {...props} />)
    expect(screen.getByRole("button", { name: "Captions unavailable" }).hasAttribute("disabled")).toBe(true)
  })

  it("keeps language, display mode and cue context inside the caption panel", async () => {
    const onCaptionTrack = vi.fn()
    const onCaptionProfile = vi.fn()
    const onOpenCaptionContext = vi.fn()
    render(<TransportStripView {...props}
      captionTracks={[
        { id: "en", language: "English", label: "English · Original", stale: false, cues: [] },
        { id: "fr", language: "French", label: "French", stale: false, cues: [] },
      ]}
      captionTrack={{ id: "en", language: "English", label: "English · Original", stale: false, cues: [] }}
      captionsEnabled
      currentCaptionCue={{ startMs: 0, endMs: 2000, text: "The light changes before the rain.", partId: 12 }}
      onCaptionTrack={onCaptionTrack}
      onCaptionProfile={onCaptionProfile}
      onOpenCaptionContext={onOpenCaptionContext}
    />)
    expect(screen.getByLabelText("Caption display")).toBeTruthy()
    expect(screen.getByRole("radiogroup", { name: "Caption display mode" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Open captions for: The light changes/ }))
    expect(onOpenCaptionContext).toHaveBeenCalledWith(12)
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Caption language" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.click(await screen.findByRole("option", { name: "French" }))
    expect(onCaptionTrack).toHaveBeenCalledWith("fr")
    fireEvent.click(screen.getByRole("radio", { name: "Word by word" }))
    expect(onCaptionProfile).toHaveBeenCalledWith("words")
  })

  it("identifies the active reusable display mode on the caption reader", () => {
    render(<TransportStripView {...props}
      captionProfile="short"
      captionTracks={[{ id: "en", language: "English", label: "English · Original", stale: false, cues: [] }]}
      captionTrack={{ id: "en", language: "English", label: "English · Original", stale: false, cues: [] }}
      captionsEnabled
      currentCaptionCue={{ startMs: 0, endMs: 2000, text: "Before the rain." }}
    />)
    expect(screen.getByRole("region", { name: "Audio player" }).getAttribute("data-caption-profile")).toBe("short")
    expect(screen.getByRole("radio", { name: "Short" }).getAttribute("data-state")).toBe("on")
  })

  it("keeps caption controls stable during timing gaps without narrating an empty cue", () => {
    const track = { id: "en", language: "English", label: "English · Original", stale: false, cues: [] }
    const { rerender } = render(<TransportStripView {...props} captionTracks={[track]} captionTrack={track} captionsEnabled currentCaptionCue={null} />)
    const player = screen.getByRole("region", { name: "Audio player" })
    expect(player.classList.contains("has-caption-dock")).toBe(true)
    expect(screen.getByLabelText("No active caption")).toBeTruthy()
    expect(screen.queryByText("No spoken caption at this position")).toBeNull()

    rerender(<TransportStripView {...props} captionTracks={[track]} captionTrack={track} captionsEnabled={false} currentCaptionCue={null} />)
    expect(player.classList.contains("has-caption-dock")).toBe(false)
    expect(screen.queryByLabelText("No active caption")).toBeNull()
  })

  it("marks an old Production preview and offers an explicit refresh", () => {
    const onRefreshPreview = vi.fn()
    render(<TransportStripView {...props} source={{ ...source, kind: "production" }} previewStale onRefreshPreview={onRefreshPreview} />)
    expect(screen.getByText("Preview out of date")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(onRefreshPreview).toHaveBeenCalledOnce()
  })
})
