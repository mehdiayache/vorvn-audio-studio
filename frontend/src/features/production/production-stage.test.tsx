// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/production/production-floating-transport", () => ({ ProductionFloatingTransport: () => <div>Transport</div> }))

import { ProductionStage } from "./production-stage"

afterEach(cleanup)

describe("ProductionStage", () => {
  it("keeps the Canvas active beside docked editing work", () => {
    const canvas = <div data-testid="canvas">Sequence</div>
    const onClose = vi.fn()
    const view = render(<ProductionStage mode={null} title="Production" onClose={onClose} canvas={canvas}>{null}</ProductionStage>)
    const original = screen.getByTestId("canvas")
    view.rerender(<ProductionStage mode="composer" title="Add speech" description="Part 12" onClose={onClose} canvas={canvas}><div>Composer</div></ProductionStage>)
    expect(screen.getByTestId("canvas")).toBe(original)
    expect(screen.getByRole("region", { name: "Add speech" })).toBeTruthy()
    expect(screen.getByTestId("canvas").parentElement?.hasAttribute("inert")).toBe(false)
    expect(screen.getByTestId("canvas").closest(".production-workstation")?.getAttribute("data-stage-layout")).toBe("docked")
    expect(screen.getByText("Composer")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Close Production panel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("makes the Canvas inert only for a full overlay workflow", () => {
    render(<ProductionStage mode="music" title="Music Bed" onClose={vi.fn()} canvas={<button>Sequence action</button>}><div>Music editor</div></ProductionStage>)
    expect(screen.getByRole("button", { name: "Sequence action", hidden: true }).parentElement?.hasAttribute("inert")).toBe(true)
    expect(screen.getByText("Music editor").closest(".production-workstation")?.getAttribute("data-stage-layout")).toBe("overlay")
  })
})
