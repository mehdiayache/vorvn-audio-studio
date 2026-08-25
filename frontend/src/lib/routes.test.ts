import { describe, expect, it } from "vitest"

import { normalizeStudioLocation, productionIdFromLocation, studioRouteFromLocation } from "@/lib/routes"

describe("Studio routes", () => {
  it("reads a semantic Production URL", () => expect(productionIdFromLocation("/audio-studio/productions/42", "")).toBe(42))
  it("reads a semantic workspace URL", () => expect(productionIdFromLocation("/studio/workspaces/19", "")).toBe(19))
  it("keeps Series distinct from Productions", () => expect(studioRouteFromLocation("/audio-studio/series/7", "")).toEqual({ type: "series", id: 7 }))
  it("uses the Auvi Studio root as a Venture directory", () => expect(studioRouteFromLocation("/audio-studio/", "")).toEqual({ type: "home", id: null }))
  it("keeps Voices as a standalone capability", () => expect(studioRouteFromLocation("/audio-studio/voices", "")).toEqual({ type: "voices", id: null }))
  it("keeps Activity inside Auvi Studio", () => expect(studioRouteFromLocation("/audio-studio/activity", "")).toEqual({ type: "activity", id: null }))
  it("keeps Settings inside Auvi Studio", () => expect(studioRouteFromLocation("/audio-studio/settings", "")).toEqual({ type: "settings", id: null }))
  it("keeps standalone Speak inside Auvi Studio", () => expect(studioRouteFromLocation("/audio-studio/speak", "")).toEqual({ type: "speak", id: null }))
  it("keeps Subtitles inside Auvi Studio", () => expect(studioRouteFromLocation("/audio-studio/subtitles", "")).toEqual({ type: "subtitles", id: null }))
  it("does not recognize the removed Batch workspace", () => expect(studioRouteFromLocation("/audio-studio/batch", "")).toEqual({ type: "home", id: null }))
  it("keeps legacy links compatible", () => expect(productionIdFromLocation("/studio/", "?tab=projects&project=6")).toBe(6))
  it("offers a clean replacement for legacy links", () => expect(normalizeStudioLocation("/studio/", "?tab=projects&project=6")).toBe("/audio-studio/productions/6"))
})
