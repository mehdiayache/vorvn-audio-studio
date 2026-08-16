// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ActivityRun } from "@/types/domain"
import { ActivityRunCard } from "./activity-run-card"

describe("ActivityRunCard", () => {
  it("presents a deletion receipt as a permanent human action, not a free provider Job", () => {
    const onOpen = vi.fn()
    const receipt = {
      id: "receipt-12345678", when: "2026-08-16T09:30:00Z",
      operation: "Production deleted", status: "ok", record_type: "audit",
      actor_label: "You", detail: "25 Parts · 2 recordings · 1 captions · 0 exports",
      cost: 0, cost_basis: "not_billed", model: null, error: "",
    } as unknown as ActivityRun

    render(<ActivityRunCard run={receipt} onOpen={onOpen} />)

    expect(screen.getByText("Permanent")).toBeTruthy()
    expect(screen.getByText("Permanent action")).toBeTruthy()
    expect(screen.queryByText("$0.0000")).toBeNull()
    fireEvent.click(screen.getByRole("button"))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
