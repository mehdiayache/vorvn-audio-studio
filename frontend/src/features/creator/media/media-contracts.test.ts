import { describe, expect, it } from "vitest"

import { mediaModelOptions } from "./media-model-selector"
import { operationPresentation } from "./media-operation-picker"
import { displayedGenerationCost } from "./media-generation-types"
import type { MediaModelFamily, MediaOperationInfo } from "./media-creator-config"

describe("Media cost truth", () => {
  it("keeps a reported zero actual cost instead of replacing it with an estimate", () => {
    expect(displayedGenerationCost({ cost: 0, estimated_cost: 2.5 })).toEqual({ value: 0, basis: "actual" })
  })

  it("uses an estimate only while actual cost is absent", () => {
    expect(displayedGenerationCost({ cost: null, estimated_cost: 2.5 })).toEqual({ value: 2.5, basis: "estimated" })
    expect(displayedGenerationCost({ cost: null, estimated_cost: null })).toBeNull()
    expect(displayedGenerationCost({ cost: 1.25, estimated_cost: 2.5 })).toEqual({ value: 1.25, basis: "actual" })
  })
})

describe("Media presentation contract", () => {
  it("uses explicit operation presentation instead of parsing operation ids", () => {
    const operation: MediaOperationInfo = {
      id: "provider_route_without_keywords", label: "Provider operation", detail: "A route",
      presentation: { mode_label: "Lip sync", icon: "audio-video" },
    }
    expect(operationPresentation(operation).label).toBe("Lip sync")
  })

  it("accepts branding for a second provider without changing the selector", () => {
    const families = [{
      id: "provider-two:model", label: "Model Two", provider: "Provider Two",
      description: "Another provider", presentation: { icon_url: "/brands/provider-two.svg" }, routes: [],
    }] satisfies MediaModelFamily[]
    expect(mediaModelOptions(families)[0]?.iconUrl).toBe("/brands/provider-two.svg")
  })
})
