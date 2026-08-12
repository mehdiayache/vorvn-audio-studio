// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StudioDock } from "./studio-dock"

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

describe("StudioDock", () => {
  it("is a non-modal workspace surface that can collapse and close", () => {
    viewport(false)
    const close = vi.fn()
    render(<StudioDock
      title="Add speech" description="Insert a durable Part." onClose={close}
      config={null} directory={{ config: null, cloned: [], meta: {}, catalog: [] }}
      playerPlaying={false} onGenerate={vi.fn()} onPlay={vi.fn()}
    />)

    const dock = screen.getByRole("region", { name: "Speech Composer" })
    expect(dock.getAttribute("aria-expanded")).toBe("true")
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Collapse Composer" }))
    expect(dock.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "Close Composer" }))
    expect(close).toHaveBeenCalledOnce()
  })

  it("uses a focus-managed full-height Sheet on mobile", () => {
    viewport(true)
    const close = vi.fn()
    render(<StudioDock
      title="Add speech" description="Insert a durable Part." onClose={close}
      config={null} directory={{ config: null, cloned: [], meta: {}, catalog: [] }}
      playerPlaying={false} onGenerate={vi.fn()} onPlay={vi.fn()}
    />)

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Speech Composer" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(close).toHaveBeenCalledOnce()
  })
})
