import { describe, expect, it } from "vitest"

import { composerCapabilityControls, resolvedDeliveryMode, selectedRouteCapability } from "./composer-capability"
import type { VoiceChoice } from "./voice-options"

function route(capabilities: VoiceChoice["capabilities"]): VoiceChoice {
  return {
    id: "binding-1", bindingId: "binding-1", identityId: "voice-1",
    name: "Voice", description: "", gender: "", source: "owned", engine: "audio",
    model: "flash", modelId: "future-model", provider: "provider-x",
    region: "region-x", adapterKey: "adapter-x", capabilities,
    compatible: true, languages: [], status: "ready",
  }
}

describe("provider-neutral Composer capability controls", () => {
  it("derives controls from capability data without inspecting provider or engine", () => {
    const capability = {
      id: "future_character_performance", name: "Character performance", description: "",
      controls: { delivery_tags: true, natural_direction: true, direction_modes: ["directed"], rate: true },
      uiMetadata: { direction_label: "Character direction" },
    }
    const selected = selectedRouteCapability(route([capability]), null)
    const controls = composerCapabilityControls(selected)
    expect(controls).toMatchObject({ deliveryTags: true, naturalDirection: true, rate: true, directionLabel: "Character direction" })
    expect(resolvedDeliveryMode(controls, "exact")).toBe("directed")
  })

  it("requires an explicit capability for a genuinely multimode binding", () => {
    const capabilities = [
      { id: "reading", name: "Reading", description: "", controls: {}, uiMetadata: {} },
      { id: "dialogue", name: "Dialogue", description: "", controls: {}, uiMetadata: {} },
    ]
    const choice = route(capabilities)
    expect(selectedRouteCapability(choice, null)).toBeNull()
    expect(selectedRouteCapability(choice, "dialogue")?.name).toBe("Dialogue")
  })
})
