// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/production/production-floating-transport", () => ({ ProductionFloatingTransport: () => <div>Transport</div> }))

import { ProductionStage } from "./production-stage"

afterEach(cleanup)

describe("ProductionStage", () => {
  it("keeps the Canvas mounted and opens work in a separate dialog stage", () => {
    const canvas = <div data-testid="canvas">Sequence</div>
    const view = render(<ProductionStage mode={null} title="Production" onClose={vi.fn()} canvas={canvas}>{null}</ProductionStage>)
    const original = screen.getByTestId("canvas")
    view.rerender(<ProductionStage mode="composer" title="Add speech" description="Part 12" onClose={vi.fn()} canvas={canvas}><div>Composer</div></ProductionStage>)
    expect(screen.getByTestId("canvas")).toBe(original)
    expect(screen.getByRole("dialog", { name: "Add speech" })).toBeTruthy()
    expect(screen.getByText("Composer")).toBeTruthy()
  })
})
