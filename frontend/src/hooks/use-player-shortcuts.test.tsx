// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { usePlayerShortcuts } from "./use-player-shortcuts"

function Harness({ openCommands }: { openCommands: () => void }) {
  usePlayerShortcuts({ hasSource: false, currentTime: 0, toggle: vi.fn(), seek: vi.fn() }, vi.fn(), openCommands)
  return <input aria-label="Script" />
}

describe("usePlayerShortcuts", () => {
  it("opens the Project command menu with Cmd/Ctrl+K even without player audio", () => {
    const openCommands = vi.fn()
    render(<Harness openCommands={openCommands} />)
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(openCommands).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })
})
