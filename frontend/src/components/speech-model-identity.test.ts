import { describe, expect, it } from "vitest"

import { resolveSpeechModel, speechProductName } from "./speech-model-identity"
import type { StudioConfig } from "@/types/domain"

const config = {
  capabilities: {
    cosyvoice: {
      label: "CosyVoice V3 Plus",
      models: { plus: "cosyvoice-v3-plus" },
    },
  },
} as unknown as StudioConfig

describe("speech model identity", () => {
  it("uses the catalogue label and never rewrites the provider model ID", () => {
    expect(speechProductName("cosyvoice", "alibaba", config)).toBe("CosyVoice V3 Plus")
    expect(resolveSpeechModel({
      engine: "cosyvoice", tier: "plus", model: "cosyvoice-v3-plus", config,
    })).toMatchObject({
      product: "CosyVoice V3 Plus",
      modelId: "cosyvoice-v3-plus",
      tier: "plus",
    })
  })
})
