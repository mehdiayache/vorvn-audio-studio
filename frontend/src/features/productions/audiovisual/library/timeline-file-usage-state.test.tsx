// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TimelineFileUsageState } from "./timeline-file-usage-state"

afterEach(cleanup)

describe("TimelineFileUsageState", () => {
  it("keeps Timeline placement semantics inside the Audiovisual host", () => {
    render(<TimelineFileUsageState count={3} />)

    expect(screen.getByLabelText("Used in Timeline").textContent).toContain("3")
  })
})
