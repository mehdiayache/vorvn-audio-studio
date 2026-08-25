// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StandaloneComposerHost } from "./standalone-composer-host"

const player = vi.hoisted(() => ({
  source: { key: "clip:1", url: "/audio/test.mp3", title: "Current recording", kind: "standalone" as const },
  state: "paused", currentTime: 2, duration: 8, volume: 1, speed: 1,
  toggle: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), setSpeed: vi.fn(), close: vi.fn(),
  transportHost: "composer" as const, claimTransport: vi.fn(() => vi.fn()),
}))
vi.mock("@/components/global-player-provider", () => ({ useGlobalPlayer: () => player }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function viewport(matches: boolean) {
  vi.stubGlobal("ResizeObserver", class { observe() {}; unobserve() {}; disconnect() {} })
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
}

const props = {
  config: null,
  directory: { config: null, cloned: [], meta: {}, catalog: [] },
  playerPlaying: false,
  onGenerate: vi.fn(),
  onPlay: vi.fn(),
}

describe("StandaloneComposerHost", () => {
  it("keeps Speak inline on desktop", () => {
    viewport(false)
    render(<StandaloneComposerHost {...props} />)
    expect(screen.getByRole("region", { name: "Script workspace" })).toBeTruthy()
    expect(screen.getByText("Generate standalone audio")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the shared Composer with accessible shared transport and contained focus in a mobile Sheet", async () => {
    viewport(true)
    render(<StandaloneComposerHost {...props} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Open Composer" }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeTruthy()
    expect(screen.getByRole("region", { name: "Script workspace" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Audio player" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Play Current recording" })).toBeTruthy()
    expect(player.claimTransport).toHaveBeenCalledWith("composer")
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })
})
