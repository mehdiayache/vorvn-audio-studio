// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { VentureIdentityField } from "./venture-identity-field"

afterEach(cleanup)

describe("VentureIdentityField", () => {
  it("offers explicit logo and emoji identity modes", () => {
    const onValueChange = vi.fn()
    const onFileChange = vi.fn()
    render(<VentureIdentityField name="Heartsnotes" value="✨" file={null} onValueChange={onValueChange} onFileChange={onFileChange} />)
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose emoji" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Use 💜" }))
    expect(onFileChange).toHaveBeenCalledWith(null)
    expect(onValueChange).toHaveBeenCalledWith("💜")
  })
})
