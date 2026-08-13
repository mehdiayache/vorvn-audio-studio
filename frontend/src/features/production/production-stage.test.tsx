// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/production/production-floating-transport", () => ({ ProductionFloatingTransport: () => <div>Transport</div> }))

import { ProductionStage } from "./production-stage"

afterEach(cleanup)

describe("ProductionStage", () => {
  it("keeps the Canvas mounted and opens work in a separate Production surface", () => {
    const canvas = <div data-testid="canvas">Sequence</div>
    const onClose = vi.fn()
    const view = render(<ProductionStage mode={null} title="Production" onClose={onClose} canvas={canvas}>{null}</ProductionStage>)
    const original = screen.getByTestId("canvas")
    view.rerender(<ProductionStage mode="composer" title="Add speech" description="Part 12" onClose={onClose} canvas={canvas}><div>Composer</div></ProductionStage>)
    expect(screen.getByTestId("canvas")).toBe(original)
    expect(screen.getByRole("region", { name: "Add speech" })).toBeTruthy()
    expect(screen.getByTestId("canvas").parentElement?.hasAttribute("inert")).toBe(true)
    expect(screen.getByText("Composer")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Back to Production sequence" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
