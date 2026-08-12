// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StandaloneComposerHost } from "./standalone-composer-host"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function viewport(matches: boolean) {
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
    expect(screen.getByLabelText("Composer sections")).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the shared Composer in a mobile Sheet", () => {
    viewport(true)
    render(<StandaloneComposerHost {...props} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Open Composer" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByLabelText("Composer sections")).toBeTruthy()
  })
})
