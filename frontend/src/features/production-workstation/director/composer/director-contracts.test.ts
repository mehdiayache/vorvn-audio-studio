import { describe, expect, it } from "vitest"

import { directorModelOptions } from "./director-model-selector"
import { operationPresentation } from "./director-operation-picker"
import { displayedGenerationCost } from "./director-generation-types"
import type { DirectorModelFamily, DirectorOperationInfo } from "./director-composer-config"

describe("Director cost truth", () => {
  it("keeps a reported zero actual cost instead of replacing it with an estimate", () => {
    expect(displayedGenerationCost({ cost: 0, estimated_cost: 2.5 })).toEqual({ value: 0, basis: "actual" })
  })

  it("uses an estimate only while actual cost is absent", () => {
    expect(displayedGenerationCost({ cost: null, estimated_cost: 2.5 })).toEqual({ value: 2.5, basis: "estimated" })
    expect(displayedGenerationCost({ cost: null, estimated_cost: null })).toBeNull()
    expect(displayedGenerationCost({ cost: 1.25, estimated_cost: 2.5 })).toEqual({ value: 1.25, basis: "actual" })
  })
})

describe("Director presentation contract", () => {
  it("uses explicit operation presentation instead of parsing operation ids", () => {
    const operation: DirectorOperationInfo = {
      id: "provider_route_without_keywords", label: "Provider operation", detail: "A route",
      presentation: { mode_label: "Lip sync", icon: "audio-video" },
    }
    expect(operationPresentation(operation).label).toBe("Lip sync")
  })

  it("accepts branding for a second provider without changing the selector", () => {
    const families = [{
      id: "provider-two:model", label: "Model Two", provider: "Provider Two",
      description: "Another provider", presentation: { icon_url: "/brands/provider-two.svg" }, routes: [],
    }] satisfies DirectorModelFamily[]
    expect(directorModelOptions(families)[0]?.iconUrl).toBe("/brands/provider-two.svg")
  })
})
