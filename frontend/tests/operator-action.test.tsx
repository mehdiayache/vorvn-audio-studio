// @vitest-environment jsdom

import { cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { useAsyncAction } from "@/hooks/use-async-action"

afterEach(cleanup)

describe("operator actions", () => {
  it("keeps working feedback on the initiating control", () => {
    render(<ActionButton busy busyLabel="Saving changes">Save</ActionButton>)
    const button = screen.getByRole("button", { name: "Saving changes" })
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(button.hasAttribute("disabled")).toBe(true)
  })

  it("requires a human label for icon-only controls", () => {
    render(<OperatorIconButton label="Close inspector"><span>×</span></OperatorIconButton>)
    expect(screen.getByRole("button", { name: "Close inspector" })).toBeTruthy()
  })

  it("suppresses duplicate work without blocking a different action", async () => {
    let release!: () => void
    const first = new Promise<void>((resolve) => { release = resolve })
    const save = vi.fn(() => first)
    const test = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAsyncAction<"save" | "test">())

    const saving = result.current.run("save", save)
    const duplicate = result.current.run("save", save)
    const testing = result.current.run("test", test)
    expect(save).toHaveBeenCalledOnce()
    expect(test).toHaveBeenCalledOnce()
    await testing
    release()
    await Promise.all([saving, duplicate])
  })
})
