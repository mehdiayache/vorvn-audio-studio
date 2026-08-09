// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProductionPlayer } from "@/components/production-player"

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const common = {
  state: "paused" as const,
  currentTime: 12,
  duration: 90,
  volume: 0.8,
  speed: 1,
  productionTitle: "Evening Reset",
  productionSubtitle: "6 parts · with Night Rain",
  productionDuration: 90,
  previewing: false,
  musicName: "Night Rain",
  onToggle: vi.fn(),
  onSeek: vi.fn(),
  onVolume: vi.fn(),
  onSpeed: vi.fn(),
  onClose: vi.fn(),
  onPlayProduction: vi.fn(),
  onOpenMusic: vi.fn(),
}

describe("ProductionPlayer resource contract", () => {
  it("labels a preview and never exposes its cache as a download", () => {
    render(<ProductionPlayer {...common} source={{ key: "preview:6", url: "/audio/preview.mp3", title: "Evening Reset", subtitle: "Exact sequence preview", kind: "preview" }} />)
    expect(screen.getByText("Full production")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Expand player" }))
    expect(screen.queryByRole("link", { name: "Download source" })).toBeNull()
  })

  it("exposes source download and playback speed only after expansion", () => {
    render(<ProductionPlayer {...common} source={{ key: "part:9", url: "/audio/part.mp3", title: "Part 09", subtitle: "Tina", kind: "part" }} />)
    expect(screen.queryByRole("link", { name: "Download source" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Expand player" }))
    expect(screen.getByRole("link", { name: "Download source" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "1× speed" }))
    expect(common.onSpeed).toHaveBeenCalledWith(1.25)
  })

  it("stays visible before a preview exists and starts the full production", () => {
    render(<ProductionPlayer {...common} source={null} state="idle" currentTime={0} duration={0} />)
    expect(screen.getByText("Evening Reset")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Play full production" }))
    expect(common.onPlayProduction).toHaveBeenCalled()
  })

  it("routes a loaded production through the freshness-aware production toggle", () => {
    render(<ProductionPlayer {...common} source={{ key: "preview:6:2", url: "/audio/preview.mp3", title: "Evening Reset", subtitle: "Exact sequence preview", kind: "preview" }} state="playing" />)
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(common.onPlayProduction).toHaveBeenCalledTimes(1)
    expect(common.onToggle).not.toHaveBeenCalled()
  })

  it("stays visible in compact mode while a production tool is open", () => {
    render(<ProductionPlayer {...common} source={null} state="idle" currentTime={0} duration={0} compact />)
    expect(screen.getByRole("region", { name: "Production player" }).classList.contains("compact")).toBe(true)
    expect(screen.getByRole("button", { name: "Play full production" })).toBeTruthy()
  })
})
