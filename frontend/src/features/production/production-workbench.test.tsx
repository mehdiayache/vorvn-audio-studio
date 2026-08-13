// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/production/production-floating-transport", () => ({ ProductionFloatingTransport: () => <div>Transport</div> }))

import { ProductionWorkbench } from "./production-workbench"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("ProductionWorkbench", () => {
  it("keeps the Canvas mounted while Workbench modes open and close", () => {
    const canvas = <div data-testid="canvas">Sequence</div>
    const view = render(<ProductionWorkbench mode={null} title="Workbench" onClose={vi.fn()} canvas={canvas}>{null}</ProductionWorkbench>)
    const original = screen.getByTestId("canvas")
    view.rerender(<ProductionWorkbench mode="part" title="Speech Part" onClose={vi.fn()} canvas={canvas}><div>Inspector</div></ProductionWorkbench>)
    expect(screen.getByTestId("canvas")).toBe(original)
    expect(screen.getByRole("complementary", { name: /Speech Part/ })).toBeTruthy()
    view.rerender(<ProductionWorkbench mode={null} title="Workbench" onClose={vi.fn()} canvas={canvas}>{null}</ProductionWorkbench>)
    expect(screen.getByTestId("canvas")).toBe(original)
  })

  it("supports keyboard resizing and remembers the resulting width", () => {
    render(<ProductionWorkbench mode="part" title="Speech Part" onClose={vi.fn()} canvas={<div>Sequence</div>}><div>Inspector</div></ProductionWorkbench>)
    const separator = screen.getByRole("separator", { name: /Resize Production Workbench/ })
    expect(separator.getAttribute("aria-valuenow")).toBe("560")
    fireEvent.keyDown(separator, { key: "ArrowLeft" })
    expect(separator.getAttribute("aria-valuenow")).toBe("584")
    expect(window.localStorage.getItem("audio-studio:production-workbench-width")).toBe("584")
  })
})
