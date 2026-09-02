// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProjectPart } from "@/types/domain"
import { MovePartPositionDialog } from "./move-part-position-dialog"

afterEach(cleanup)

describe("MovePartPositionDialog", () => {
  it("uses a one-based accessible position and returns the explicit target", async () => {
    const part = { id: 5, public_id: "part-five", kind: "speech", position: 1 } as ProjectPart
    const onMove = vi.fn().mockResolvedValue(undefined)
    render(<MovePartPositionDialog part={part} count={5} onClose={vi.fn()} onMove={onMove} />)

    expect((screen.getByRole("spinbutton", { name: "New Part position" }) as HTMLInputElement).value).toBe("2")
    fireEvent.change(screen.getByRole("spinbutton", { name: "New Part position" }), { target: { value: "5" } })
    fireEvent.click(screen.getByRole("button", { name: "Move to position 5" }))

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(part, 5))
  })
})
