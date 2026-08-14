import { describe, expect, it } from "vitest"

import type { ProductionPart } from "@/types/domain"
import { EMPTY_SEQUENCE_FILTERS, filterProductionParts } from "./production-sequence-search"

const parts = [
  { id: 1, kind: "speech", text: "The lighthouse keeper checks the eastern window.", voice_name: "Samira", selected_take_id: 10, subtitled: true },
  { id: 2, kind: "draft", text: "A storm warning arrives before midnight." },
  { id: 3, kind: "speech", text: "Secure the boats before the tide turns.", voice_name: "Mina", selected_take_id: 12, subtitled: false },
] as ProductionPart[]

describe("filterProductionParts", () => {
  it("searches script, Voice, and stable Part number", () => {
    expect(filterProductionParts(parts, new Set(), { ...EMPTY_SEQUENCE_FILTERS, query: "lighthouse" }).map((part) => part.id)).toEqual([1])
    expect(filterProductionParts(parts, new Set(), { ...EMPTY_SEQUENCE_FILTERS, query: "Samira" }).map((part) => part.id)).toEqual([1])
    expect(filterProductionParts(parts, new Set(), { ...EMPTY_SEQUENCE_FILTERS, query: "part 3" }).map((part) => part.id)).toEqual([3])
  })

  it("combines Draft, issue, and caption filters without changing order", () => {
    expect(filterProductionParts(parts, new Set([2, 3]), { ...EMPTY_SEQUENCE_FILTERS, issues: true }).map((part) => part.id)).toEqual([2, 3])
    expect(filterProductionParts(parts, new Set(), { ...EMPTY_SEQUENCE_FILTERS, drafts: true }).map((part) => part.id)).toEqual([2])
    expect(filterProductionParts(parts, new Set(), { ...EMPTY_SEQUENCE_FILTERS, noCaptions: true }).map((part) => part.id)).toEqual([3])
  })

  it("keeps a 150-Part Production in deterministic sequence order", () => {
    const longProduction = Array.from({ length: 150 }, (_, index) => ({
      id: index + 1,
      kind: "draft",
      text: `Chapter ${index + 1} of the field recording`,
    })) as ProductionPart[]

    expect(filterProductionParts(longProduction, new Set(), EMPTY_SEQUENCE_FILTERS)).toEqual(longProduction)
    expect(filterProductionParts(longProduction, new Set(), { ...EMPTY_SEQUENCE_FILTERS, query: "part 150" }).map((part) => part.id)).toEqual([150])
  })
})
