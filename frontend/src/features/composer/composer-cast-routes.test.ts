import { describe, expect, it } from "vitest"

import type { VoiceChoice } from "@/lib/voice-options"
import type { ProductionCastRole } from "@/types/domain"
import { routesAllowedForCastRole } from "./composer-controller"

const route = (id: string, catalogueVoiceId: string | null): VoiceChoice => ({
  id,
  catalogueVoiceId,
  identityId: catalogueVoiceId ? "catalogue" : "owned",
  name: id,
  description: "",
  source: catalogueVoiceId ? "catalogue" : "owned",
  engine: "audio",
  model: "flash",
  modelId: "model",
  provider: "provider",
  region: "region",
  adapterKey: "adapter",
  capabilities: [],
  compatible: true,
  languages: [],
  status: "ready",
})

describe("routesAllowedForCastRole", () => {
  it("offers only the exact catalogue route assigned to a catalogue Cast Role", () => {
    const routes = [route("catalogue-a", "catalogue-a"), route("catalogue-b", "catalogue-b")]
    const role = { id: "role", voice_source_kind: "catalogue", catalogue_voice_id: "catalogue-b" } as ProductionCastRole
    expect(routesAllowedForCastRole(routes, role).map((item) => item.id)).toEqual(["catalogue-b"])
  })

  it("does not narrow identity-backed roles beyond their identity routes", () => {
    const routes = [route("binding-a", null), route("binding-b", null)]
    const role = { id: "role", voice_source_kind: "identity", voice_identity_id: "owned" } as ProductionCastRole
    expect(routesAllowedForCastRole(routes, role)).toEqual(routes)
  })
})
