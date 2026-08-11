// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RecordingLanguageField } from "./recording-language-field"

afterEach(cleanup)

describe("RecordingLanguageField", () => {
  it("accepts undocumented provenance instead of creating a language gate", () => {
    const changed = vi.fn()
    render(<RecordingLanguageField
      value=""
      onChange={changed}
      suggestions={[["en", "English"], ["ar", "Arabic"]]}
    />)
    const field = screen.getByRole("combobox", {
      name: "Language spoken in this recording",
    })
    fireEvent.change(field, { target: { value: "Wolof" } })
    expect(changed).toHaveBeenCalledWith("Wolof")
    expect(screen.getByText(/Any language is accepted/)).toBeTruthy()
  })
})
