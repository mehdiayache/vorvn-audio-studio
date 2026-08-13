import { describe, expect, it } from "vitest"

import type { Take } from "@/types/domain"
import { stableAlternativeOrdinals } from "./part-inspector-takes"

const take = (id: number, when: string) => ({ id, when } as Take)

describe("Part Workbench Take ordinals", () => {
  it("preserves the selected Take gap in stable creation order", () => {
    const ordinals = stableAlternativeOrdinals([
      take(30, "2026-08-13T10:03:00Z"),
      take(10, "2026-08-13T10:01:00Z"),
      take(20, "2026-08-13T10:03:00Z"),
    ], 2)

    expect(ordinals.get(10)).toBe(1)
    expect(ordinals.get(20)).toBe(3)
    expect(ordinals.get(30)).toBe(4)
  })
})
