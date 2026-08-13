// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { DurableJob } from "@/types/domain"
import { OperationState } from "./operation-state"

function job(values: Partial<DurableJob> = {}): DurableJob {
  return { id: "job-123", type: "speech", status: "running", progress: 42, detail: "Recording speech", error: null, retries: 0, result: {}, ...values }
}

describe("OperationState", () => {
  it("announces durable progress", () => {
    render(<OperationState job={job()} title="Speech generation" />)
    expect(screen.getByText("Speech generation")).toBeTruthy()
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toContain("42%")
  })

  it("offers confirmation for a blocked cost guard", () => {
    const confirm = vi.fn()
    render(<OperationState job={job({ status: "blocked", result: { needs_confirmation: true, estimate: .0123 } })} onConfirm={confirm} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirm $0.0123 and continue" }))
    expect(confirm).toHaveBeenCalledOnce()
  })

  it("keeps ambiguous work review-only", () => {
    render(<OperationState job={job({ status: "blocked", result: { requires_review: true, ambiguous: true } })} onRetry={vi.fn()} />)
    expect(screen.getByText("Review required")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })
})
