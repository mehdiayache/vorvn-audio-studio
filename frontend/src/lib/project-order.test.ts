import { describe, expect, it } from "vitest"

import { moveSelectionToPosition } from "./project-order"

describe("moveSelectionToPosition", () => {
  it("moves a non-contiguous selection as one stable ordered block", () => {
    expect(moveSelectionToPosition([1, 2, 3, 4, 5, 6], [2, 5], 3)).toEqual([1, 3, 2, 5, 4, 6])
  })

  it("clamps one-based targets without dropping unknown ids", () => {
    expect(moveSelectionToPosition([1, 2, 3, 4], [3, 999], 99)).toEqual([1, 2, 4, 3])
    expect(moveSelectionToPosition([1, 2, 3, 4], [2, 3], 0)).toEqual([2, 3, 1, 4])
  })
})
